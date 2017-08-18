import Element, { ElementOrElementId } from './Element';
import Server, { Method } from './Server';
import findDisplayed from './lib/findDisplayed';
import { partial } from '@dojo/core/lang';
import Task from '@dojo/core/async/Task';
import statusCodes from './lib/statusCodes';
import Locator, { toW3cLocator, Strategy } from './lib/Locator';
import { forCommand as utilForCommand, sleep, toExecuteString } from './lib/util';
import waitForDeleted from './lib/waitForDeleted';
import { Capabilities, Geolocation, LogEntry, WebDriverCookie, WebDriverResponse } from './interfaces';

export default class Session extends Locator<Task<Element>, Task<Element[]>, Task<void>> {
	private _sessionId: string;
	private _server: Server;
	private _capabilities: Capabilities;
	private _closedWindows: any = null;
	// TODO: Timeouts are held so that we can fiddle with the implicit wait timeout to add efficient `waitFor`
	// and `waitForDeleted` convenience methods. Technically only the implicit timeout is necessary.
	private _timeouts: { [key: string]: Task<number>; } = {};
	private _movedToElement = false;
	private _lastMousePosition: any = null;
	private _lastAltitude: any = null;
	private _nextRequest: Task<any>;

	/**
	 * A Session represents a connection to a remote environment that can be driven programmatically.
	 *
	 * @param sessionId The ID of the session, as provided by the remote.
	 * @param server The server that the session belongs to.
	 * @param capabilities A map of bugs and features that the remote environment exposes.
	 */
	constructor(sessionId: string, server: Server, capabilities: Capabilities) {
		super();

		this._sessionId = sessionId;
		this._server = server;
		this._capabilities = capabilities;
		this._closedWindows = {};
		this._timeouts = {
			script: Task.resolve(0),
			implicit: Task.resolve(0),
			'page load': Task.resolve(Infinity)
		};
	}

	/**
	 * Information about the available features and bugs in the remote environment.
	 *
	 * @readonly
	 */
	get capabilities() {
		return this._capabilities;
	}

	/**
	 * The current session ID.
	 *
	 * @readonly
	 */
	get sessionId() {
		return this._sessionId;
	}

	/**
	 * The Server that the session runs on.
	 *
	 * @readonly
	 */
	get server() {
		return this._server;
	}

	/**
	 * Delegates the HTTP request for a method to the underlying [[Server]] object.
	 *
	 * @private
	 */
	private _delegateToServer<T>(method: Method, path: string, requestData: any, pathParts?: string[]) {
		path = 'session/' + this._sessionId + (path ? ('/' + path) : '');

		if (method === 'post' && !requestData && this.capabilities.brokenEmptyPost) {
			requestData = {};
		}

		let cancelled = false;
		return new Task<T>((resolve, reject) => {
			// The promise is cleared from `_nextRequest` once it has been resolved in order to avoid
			// infinitely long chains of promises retaining values that are not used any more
			let thisRequest: Task<any>;
			const clearNextRequest = () => {
				if (this._nextRequest === thisRequest) {
					this._nextRequest = null;
				}
			};

			const runRequest = () => {
				// `runRequest` is normally called once the previous request is finished. If this request
				// is cancelled before the previous request is finished, then it should simply never run.
				// (This Task will have been rejected already by the cancellation.)
				if (cancelled) {
					clearNextRequest();
					return;
				}

				const response = this._server[method]<WebDriverResponse>(path, requestData, pathParts)
					.then(response => response.value);

				// safePromise is simply a promise based on the response that is guaranteed to resolve -- it is only
				// used for promise chain management
				const safePromise = response.catch(_error => { });
				safePromise.then(clearNextRequest);

				// The value of the response always needs to be taken directly from the server call
				// rather than from the chained `_nextRequest` promise, since if an undefined value is
				// returned by the server call and that value is returned through `finally(runRequest)`,
				// the *previous* Task’s resolved value will be used as the resolved value, which is
				// wrong
				resolve(response);

				return safePromise;
			};

			// At least ChromeDriver 2.19 will just hard close connections if parallel requests are made to the server,
			// so any request sent to the server for a given session must be serialised. Other servers like Selendroid
			// have been known to have issues with parallel requests as well, so serialisation is applied universally,
			// even though it has negative performance implications
			if (this._nextRequest) {
				thisRequest = this._nextRequest = this._nextRequest.finally(runRequest);
			}
			else {
				thisRequest = this._nextRequest = runRequest();
			}
		}, () => cancelled = true);
	}

	serverGet<T>(path: string, requestData?: any, pathParts?: string[]) {
		return this._delegateToServer<T>('get', path, requestData, pathParts);
	}

	serverPost<T>(path: string, requestData?: any, pathParts?: string[]) {
		return this._delegateToServer<T>('post', path, requestData, pathParts);
	}

	serverDelete<T>(path: string, requestData?: any, pathParts?: string[]) {
		return this._delegateToServer<T>('delete', path, requestData, pathParts);
	}

	/**
	 * Gets the current value of a timeout for the session.
	 *
	 * @param type The type of timeout to retrieve. One of 'script', 'implicit', or 'page load'.
	 * @returns The timeout, in milliseconds.
	 */
	getTimeout(type: string): Task<number> {
		return this._timeouts[type];
	}

	/**
	 * Sets the value of a timeout for the session.
	 *
	 * @param type
	 * The type of timeout to set. One of 'script', 'implicit', or 'page load'.
	 *
	 * @param ms
	 * The length of time to use for the timeout, in milliseconds. A value of 0 will cause operations to time out
	 * immediately.
	 */
	setTimeout(type: string, ms: number) {
		// Infinity cannot be serialised by JSON
		if (ms === Infinity) {
			// It seems that at least ChromeDriver 2.10 has a limit here that is near the 32-bit signed integer limit,
			// and IEDriverServer 2.42.2 has an even lower limit; 2.33 hours should be infinite enough for testing
			ms = Math.pow(2, 23) - 1;
		}

		// If the target doesn't support a timeout of 0, use 1.
		if (this.capabilities.brokenZeroTimeout && ms === 0) {
			ms = 1;
		}

		const promise = this.serverPost<void>('timeouts', {
			type: type,
			ms: ms
		}).catch(error => {
			// Appium as of April 2014 complains that `timeouts` is unsupported, so try the more specific
			// endpoints if they exist
			if (error.name === 'UnknownCommand') {
				if (type === 'script') {
					return this.serverPost<void>('timeouts/async_script', { ms: ms });
				}
				else if (type === 'implicit') {
					return this.serverPost<void>('timeouts/implicit_wait', { ms: ms });
				}
			}

			throw error;
		});

		this._timeouts[type] = promise.then(function () {
			return ms;
		}).catch(error => null);

		return promise;
	}

	/**
	 * Gets the identifier for the window that is currently focused.
	 *
	 * @returns A window handle identifier that can be used with other window handling functions.
	 */
	getCurrentWindowHandle() {
		return this.serverGet<string>('window_handle').then(handle => {
			if (this.capabilities.brokenDeleteWindow && this._closedWindows[handle]) {
				const error: SessionError = new Error();
				error.status = '23';
				error.name = statusCodes[error.status][0];
				error.message = statusCodes[error.status][1];
				throw error;
			}

			return handle;
		});
	}

	/**
	 * Gets a list of identifiers for all currently open windows.
	 */
	getAllWindowHandles() {
		return this.serverGet<string[]>('window_handles').then((handles: string[]) => {
			if (this.capabilities.brokenDeleteWindow) {
				return handles.filter(handle => { return !this._closedWindows[handle]; });
			}

			return handles;
		});
	}

	/**
	 * Gets the URL that is loaded in the focused window/frame.
	 */
	getCurrentUrl() {
		return this.serverGet<string>('url');
	}

	/**
	 * Navigates the focused window/frame to a new URL.
	 */
	get(url: string) {
		this._movedToElement = false;

		if (this.capabilities.brokenMouseEvents) {
			this._lastMousePosition = { x: 0, y: 0 };
		}

		return this.serverPost<void>('url', { url: url });
	}

	/**
	 * Navigates the focused window/frame forward one page using the browser’s navigation history.
	 */
	goForward() {
		// TODO: SPEC: Seems like this and `back` should return the newly navigated URL.
		return this.serverPost<void>('forward');
	}

	/**
	 * Navigates the focused window/frame back one page using the browser’s navigation history.
	 */
	goBack() {
		// TODO: SPEC: Seems like this and `back` should return the newly navigated URL.
		return this.serverPost<void>('back');
	}

	/**
	 * Reloads the current browser window/frame.
	 */
	refresh() {
		if (this.capabilities.brokenRefresh) {
			return this.execute<void>('location.reload();');
		}

		return this.serverPost<void>('refresh');
	}

	/**
	 * Executes JavaScript code within the focused window/frame. The code should return a value synchronously.
	 *
	 * @see [[Session.executeAsync]] to execute code that returns values asynchronously.
	 *
	 * @param script
	 * The code to execute. This function will always be converted to a string, sent to the remote environment, and
	 * reassembled as a new anonymous function on the remote end. This means that you cannot access any variables
	 * through closure. If your code needs to get data from variables on the local end, they should be passed using
	 * `args`.
	 *
	 * @param args
	 * An array of arguments that will be passed to the executed code. Only values that can be serialised to JSON, plus
	 * [[Element]] objects, can be specified as arguments.
	 *
	 * @returns
	 * The value returned by the remote code. Only values that can be serialised to JSON, plus DOM elements, can be
	 * returned.
	 */
	execute<T>(script: Function | string, args?: any[]): Task<T> {
		// At least FirefoxDriver 2.40.0 will throw a confusing NullPointerException if args is not an array;
		// provide a friendlier error message to users that accidentally pass a non-array
		if (typeof args !== 'undefined' && !Array.isArray(args)) {
			throw new Error('Arguments passed to execute must be an array');
		}

		let result = this.serverPost<T>('execute', {
			script: toExecuteString(script),
			args: args || []
		}).then(value => convertToElements(this, value), fixExecuteError);

		if (this.capabilities.brokenExecuteUndefinedReturn) {
			result = result.then(value => value == null ? null : value);
		}

		return result;
	}

	/**
	 * Executes JavaScript code within the focused window/frame. The code must invoke the provided callback in
	 * order to signal that it has completed execution.
	 *
	 * @see [[Session.execute]] to execute code that returns values synchronously.
	 * @see [[Session.setExecuteAsyncTimeout]] to set the time until an asynchronous script is
	 * considered timed out.
	 *
	 * @param script
	 * The code to execute. This function will always be converted to a string, sent to the remote environment, and
	 * reassembled as a new anonymous function on the remote end. This means that you cannot access any variables
	 * through closure. If your code needs to get data from variables on the local end, they should be passed using
	 * `args`.
	 *
	 * @param args
	 * An array of arguments that will be passed to the executed code. Only values that can be serialised to JSON, plus
	 * [[Element]] objects, can be specified as arguments. In addition to these arguments, a
	 * callback function will always be passed as the final argument to the function specified in `script`. This
	 * callback function must be invoked in order to signal that execution has completed. The return value of the
	 * execution, if any, should be passed to this callback function.
	 *
	 * @returns
	 * The value returned by the remote code. Only values that can be serialised to JSON, plus DOM elements, can be
	 * returned.
	 */
	executeAsync<T>(script: Function | string, args?: any[]) {
		// At least FirefoxDriver 2.40.0 will throw a confusing NullPointerException if args is not an array;
		// provide a friendlier error message to users that accidentally pass a non-array
		if (typeof args !== 'undefined' && !Array.isArray(args)) {
			throw new Error('Arguments passed to executeAsync must be an array');
		}

		return this.serverPost<T>('execute_async', {
			script: toExecuteString(script),
			args: args || []
		}).then(partial(convertToElements, this), fixExecuteError);
	}

	/**
	 * Gets a screenshot of the focused window and returns it in PNG format.
	 *
	 * @returns A buffer containing a PNG image.
	 */
	takeScreenshot() {
		return this.serverGet<string>('screenshot').then(data => new Buffer(data, 'base64'));
	}

	/**
	 * Gets a list of input method editor engines available to the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	getAvailableImeEngines() {
		return this.serverGet<string[]>('ime/available_engines');
	}

	/**
	 * Gets the currently active input method editor for the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	getActiveImeEngine() {
		return this.serverGet<string>('ime/active_engine');
	}

	/**
	 * Returns whether or not an input method editor is currently active in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	isImeActivated() {
		return this.serverGet<boolean>('ime/activated');
	}

	/**
	 * Deactivates any active input method editor in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	deactivateIme() {
		return this.serverPost<void>('ime/deactivate');
	}

	/**
	 * Activates an input method editor in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 *
	 * @param engine The type of IME to activate.
	 */
	activateIme(engine: string) {
		return this.serverPost<void>('ime/activate', { engine: engine });
	}

	/**
	 * Switches the currently focused frame to a new frame.
	 *
	 * @param id
	 * The frame to switch to. In most environments, a number or string value corresponds to a key in the
	 * `window.frames` object of the currently active frame. If `null`, the topmost (default) frame will be used.
	 * If an Element is provided, it must correspond to a `<frame>` or `<iframe>` element.
	 */
	switchToFrame(id: string | number | Element) {
		return this.serverPost<void>('frame', { id: id });
	}

	/**
	 * Switches the currently focused window to a new window.
	 *
	 * @param handle
	 * The handle of the window to switch to. In mobile environments and environments based on the W3C WebDriver
	 * standard, this should be a handle as returned by [[Session.getAllWindowHandles]].
	 *
	 * In environments using the JsonWireProtocol, this value corresponds to the `window.name` property of a window.
	 */
	switchToWindow(handle: string) {
		return this.serverPost<void>('window', {
			// TODO: Note that in the W3C standard, the property is 'handle'
			name: handle
		});
	}

	/**
	 * Switches the currently focused frame to the parent of the currently focused frame.
	 */
	switchToParentFrame() {
		return this.serverPost<void>('frame/parent').catch(error => {
			// At least FirefoxDriver 2.40.0 does not implement this command, but we can fake it by retrieving
			// the parent frame element using JavaScript and switching to it directly by reference
			// At least Selendroid 0.9.0 also does not support this command, but unfortunately throws an incorrect
			// error so it looks like a fatal error; see https://github.com/selendroid/selendroid/issues/364
			if (error.name === 'UnknownCommand' ||
				(
					this.capabilities.browserName === 'selendroid' &&
					error.message.indexOf('Error occured while communicating with selendroid server') > -1
				)
			) {
				if (this.capabilities.scriptedParentFrameCrashesBrowser) {
					throw error;
				}

				return this.execute<Element>('return window.parent.frameElement;').then(parent => {
					// TODO: Using `null` if no parent frame was returned keeps the request from being invalid,
					// but may be incorrect and may cause incorrect frame retargeting on certain platforms;
					// At least Selendroid 0.9.0 fails both commands
					return this.switchToFrame(parent || null);
				});
			}

			throw error;
		});
	}

	/**
	 * Closes the currently focused window. In most environments, after the window has been closed, it is necessary
	 * to explicitly switch to whatever window is now focused.
	 */
	closeCurrentWindow() {
		const self = this;
		function manualClose() {
			return self.getCurrentWindowHandle().then(function (handle: any) {
				return self.execute('window.close();').then(function () {
					self._closedWindows[handle] = true;
				});
			});
		}

		if (this.capabilities.brokenDeleteWindow) {
			return manualClose();
		}

		return this.serverDelete<void>('window').catch(error => {
			// ios-driver 0.6.6-SNAPSHOT April 2014 does not implement close window command
			if (error.name === 'UnknownCommand') {
				this.capabilities.brokenDeleteWindow = true;
				return manualClose();
			}

			throw error;
		});
	}

	/**
	 * Sets the dimensions of a window.
	 *
	 * @param windowHandle
	 * The name of the window to resize. See [[Session.switchToWindow]] to learn about valid
	 * window names. Omit this argument to resize the currently focused window.
	 *
	 * @param width
	 * The new width of the window, in CSS pixels.
	 *
	 * @param height
	 * The new height of the window, in CSS pixels.
	 */
	setWindowSize(width: number, height: number): Task<void>;
	setWindowSize(windowHandle: string, width: number, height: number): Task<void>;
	setWindowSize(...args: any[]) {
		let [windowHandle, width, height] = args;

		if (typeof height === 'undefined') {
			height = width;
			width = windowHandle;
			windowHandle = null;
		}

		const data: { [key: string]: number | null } = {
			width: width,
			height: height
		};

		const setWindowSize = () => {
			if (this.capabilities.supportsWindowRectCommand) {
				data.x = null;
				data.y = null;
				return this.serverPost<void>('window/rect', data);
			}
			else {
				return this.serverPost<void>('window/size', data);
			}
		};

		if (this.capabilities.implicitWindowHandles) {
			if (windowHandle == null) {
				return setWindowSize();
			}
			else {
				// User provided a window handle; get the current handle, switch to the new one, get the size, then
				// switch back to the original handle.
				let error: Error;
				return this.getCurrentWindowHandle().then(originalHandle => {
					return this.switchToWindow(windowHandle).then(() => {
						return setWindowSize();
					}).catch(function (_error) {
						error = error;
					}).then(() => {
						return this.switchToWindow(originalHandle);
					}).then(() => {
						if (error) {
							throw error;
						}
					});
				});
			}
		}
		else {
			if (windowHandle == null) {
				windowHandle = 'current';
			}
			return this.serverPost<void>('window/$0/size', {
				width: width,
				height: height
			}, [windowHandle]);
		}
	}

	/**
	 * Gets the dimensions of a window.
	 *
	 * @param windowHandle
	 * The name of the window to query. See [[Session.switchToWindow]] to learn about valid
	 * window names. Omit this argument to query the currently focused window.
	 *
	 * @returns
	 * An object describing the width and height of the window, in CSS pixels.
	 */
	getWindowSize(windowHandle?: string) {
		const getWindowSize = () => {
			if (this.capabilities.supportsWindowRectCommand) {
				return this.serverGet<{ width: number, height: number, x: number, y: number }>('window/rect').then(rect => {
					return { width: rect.width, height: rect.height };
				});
			}
			else {
				return this.serverGet<{ width: number, height: number }>('window/size');
			}
		};

		if (this.capabilities.implicitWindowHandles) {
			if (windowHandle == null) {
				return getWindowSize();
			}
			else {
				// User provided a window handle; get the current handle, switch to the new one, get the size, then
				// switch back to the original handle.
				let error: Error;
				let size: { width: number, height: number };
				return this.getCurrentWindowHandle().then(originalHandle => {
					return this.switchToWindow(windowHandle).then(() => {
						return getWindowSize();
					}).then((_size) => {
						size = _size;
					}, (_error) => {
						error = _error;
					}).then(() => {
						return this.switchToWindow(originalHandle);
					}).then(() => {
						if (error) {
							throw error;
						}
						return size;
					});
				});
			}
		}
		else {
			if (typeof windowHandle === 'undefined') {
				windowHandle = 'current';
			}
			return this.serverGet<{ width: number, height: number }>('window/$0/size', null, [windowHandle]);
		}
	}

	/**
	 * Sets the position of a window.
	 *
	 * Note that this method is not part of the W3C WebDriver standard.
	 *
	 * @param windowHandle
	 * The name of the window to move. See [[Session.switchToWindow]] to learn about valid
	 * window names. Omit this argument to move the currently focused window.
	 *
	 * @param x
	 * The screen x-coordinate to move to, in CSS pixels, relative to the left edge of the primary monitor.
	 *
	 * @param y
	 * The screen y-coordinate to move to, in CSS pixels, relative to the top edge of the primary monitor.
	 */
	setWindowPosition(x: number, y: number): Task<void>;
	setWindowPosition(windowHandle: string, x: number, y: number): Task<void>;
	setWindowPosition(...args: any[]) {
		let [windowHandle, x, y] = args;

		if (typeof y === 'undefined') {
			y = x;
			x = windowHandle;
			windowHandle = 'current';
		}

		return this.serverPost<void>('window/$0/position', {
			x: x,
			y: y
		}, [windowHandle]);
	}

	/**
	 * Gets the position of a window.
	 *
	 * Note that this method is not part of the W3C WebDriver standard.
	 *
	 * @param windowHandle
	 * The name of the window to query. See [[Session.switchToWindow]] to learn about valid
	 * window names. Omit this argument to query the currently focused window.
	 *
	 * @returns
	 * An object describing the position of the window, in CSS pixels, relative to the top-left corner of the
	 * primary monitor. If a secondary monitor exists above or to the left of the primary monitor, these values
	 * will be negative.
	 */
	getWindowPosition(windowHandle?: string) {
		if (typeof windowHandle === 'undefined') {
			windowHandle = 'current';
		}

		return this.serverGet<{ x: number, y: number }>('window/$0/position', null, [windowHandle]).then(function (position) {
			// At least InternetExplorerDriver 2.41.0 on IE9 returns an object containing extra properties
			return { x: position.x, y: position.y };
		});
	}

	/**
	 * Maximises a window according to the platform’s window system behaviour.
	 *
	 * @param windowHandle
	 * The name of the window to resize. See [[Session.switchToWindow]] to learn about valid
	 * window names. Omit this argument to resize the currently focused window.
	 */
	maximizeWindow(windowHandle?: string) {
		if (typeof windowHandle === 'undefined') {
			windowHandle = 'current';
		}

		return this.serverPost<void>('window/$0/maximize', null, [windowHandle]);
	}

	/**
	 * Gets all cookies set on the current page.
	 */
	getCookies() {
		return this.serverGet<WebDriverCookie[]>('cookie').then(function (cookies: WebDriverCookie[]) {
			// At least SafariDriver 2.41.0 returns cookies with extra class and hCode properties that should not
			// exist
			return cookies.map(function (badCookie) {
				let cookie: any = {};
				for (let key in badCookie) {
					if (key === 'name' || key === 'value' || key === 'path' || key === 'domain' ||
						key === 'secure' || key === 'httpOnly' || key === 'expiry'
					) {
						cookie[key] = (<any>badCookie)[key];
					}
				}

				if (typeof cookie.expiry === 'number') {
					cookie.expiry = new Date(cookie.expiry * 1000);
				}

				return cookie;
			});
		});
	}

	/**
	 * Sets a cookie on the current page.
	 */
	setCookie(cookie: WebDriverCookie) {
		if (typeof cookie.expiry === 'string') {
			cookie.expiry = new Date(cookie.expiry);
		}

		if (cookie.expiry instanceof Date) {
			cookie.expiry = cookie.expiry.valueOf() / 1000;
		}
		const self = this;

		return this.serverPost<void>('cookie', {
			cookie: cookie
		}).catch((error: SessionError) => {
			// At least ios-driver 0.6.0-SNAPSHOT April 2014 does not know how to set cookies
			if (error.name === 'UnknownCommand') {
				// Per RFC6265 section 4.1.1, cookie names must match `token` (any US-ASCII character except for
				// control characters and separators as defined in RFC2616 section 2.2)
				if (/[^A-Za-z0-9!#$%&'*+.^_`|~-]/.test(cookie.name)) {
					error = new Error();
					error.status = '25';
					error.name = statusCodes[error.status][0];
					error.message = 'Invalid cookie name';
					throw error;
				}

				if (/[^\u0021\u0023-\u002b\u002d-\u003a\u003c-\u005b\u005d-\u007e]/.test(cookie.value)) {
					error = new Error();
					error.status = '25';
					error.name = statusCodes[error.status][0];
					error.message = 'Invalid cookie value';
					throw error;
				}

				const cookieToSet = [cookie.name + '=' + cookie.value];

				pushCookieProperties(cookieToSet, cookie);

				return self.execute<void>(/* istanbul ignore next */ function (cookie: any) {
					document.cookie = cookie;
				}, [cookieToSet.join(';')]);
			}

			throw error;
		});
	}

	/**
	 * Clears all cookies for the current page.
	 */
	clearCookies() {
		if (this.capabilities.brokenDeleteCookie) {
			return this.getCookies().then(cookies => {
				return cookies.reduce((promise, cookie) => {
					const expiredCookie = [
						`${cookie.name}=`,
						'expires=Thu, 01 Jan 1970 00:00:00 GMT'
					];
					pushCookieProperties(expiredCookie, cookie);

					return promise.then(() => {
						return this.execute<void>(/* istanbul ignore next */ function (expiredCookie: string) {
							// Assume the cookie was created by Selenium, so it's path is '/'; at least MS Edge
							// requires a path to delete a cookie
							document.cookie = `${expiredCookie}; domain=${encodeURIComponent(document.domain)}; path=/`;
						}, [expiredCookie.join(';')]);
					});
				}, Task.resolve());
			});
		}

		return this.serverDelete<void>('cookie');
	}

	/**
	 * Deletes a cookie on the current page.
	 *
	 * @param name The name of the cookie to delete.
	 */
	deleteCookie(name: string) {
		if (this.capabilities.brokenDeleteCookie) {
			return this.getCookies().then(cookies => {
				let cookie: any;
				if (cookies.some(function (value) {
					if (value.name === name) {
						cookie = value;
						return true;
					}
				})) {
					const expiredCookie = [
						`${cookie.name}=`,
						'expires=Thu, 01 Jan 1970 00:00:00 GMT'
					];

					pushCookieProperties(expiredCookie, cookie);

					return this.execute<void>(/* istanbul ignore next */ function (expiredCookie: any) {
						// Assume the cookie was created by Selenium, so it's path is '/'; at least MS Edge requires
						// a path to delete a cookie
						document.cookie = `${expiredCookie}; domain=${encodeURIComponent(document.domain)}; path=/`;
					}, [expiredCookie.join(';')]);
				}
			});
		}

		return this.serverDelete<void>('cookie/$0', null, [name]);
	}

	/**
	 * Gets the HTML loaded in the focused window/frame. This markup is serialised by the remote environment so
	 * may not exactly match the HTML provided by the Web server.
	 */
	getPageSource() {
		if (this.capabilities.brokenPageSource) {
			return this.execute<string>(/* istanbul ignore next */ function () {
				return document.documentElement.outerHTML;
			});
		}
		else {
			return this.serverGet<string>('source');
		}
	}

	/**
	 * Gets the title of the top-level browsing context of the current window or tab.
	 */
	getPageTitle() {
		return this.serverGet<string>('title');
	}

	/**
	 * Gets the first element from the focused window/frame that matches the given query.
	 *
	 * @see [[Session.setFindTimeout]] to set the amount of time it the remote environment
	 * should spend waiting for an element that does not exist at the time of the `find` call before timing
	 * out.
	 *
	 * @param using
	 * The element retrieval strategy to use. One of 'class name', 'css selector', 'id', 'name', 'link text',
	 * 'partial link text', 'tag name', 'xpath'.
	 *
	 * @param value
	 * The strategy-specific value to search for. For example, if `using` is 'id', `value` should be the ID of the
	 * element to retrieve.
	 */
	find(using: Strategy, value: string) {
		if (this.capabilities.isWebDriver) {
			const locator = toW3cLocator(using, value);
			using = locator.using;
			value = locator.value;
		}

		if (this.capabilities.isWebDriver) {
			const locator = toW3cLocator(using, value);
			using = locator.using;
			value = locator.value;
		}

		if (using.indexOf('link text') !== -1 && (
			this.capabilities.brokenWhitespaceNormalization || this.capabilities.brokenLinkTextLocator
		)) {
			return this.execute<Element>(/* istanbul ignore next */ this._manualFindByLinkText, [using, value])
				.then(element => {
					if (!element) {
						const error = new Error();
						error.name = 'NoSuchElement';
						throw error;
					}
					return new Element(element, this);
				});
		}

		return this.serverPost<any>('element', {
			using: using,
			value: value
		}).then(element => {
			return new Element(element, this);
		});
	}

	/**
	 * Gets an array of elements from the focused window/frame that match the given query.
	 *
	 * @param using
	 * The element retrieval strategy to use. See [[Session.find]] for options.
	 *
	 * @param {string} value
	 * The strategy-specific value to search for. See [[Session.find]] for details.
	 */
	findAll(using: Strategy, value: string) {
		if (this.capabilities.isWebDriver) {
			const locator = toW3cLocator(using, value);
			using = locator.using;
			value = locator.value;
		}

		if (this.capabilities.isWebDriver) {
			const locator = toW3cLocator(using, value);
			using = locator.using;
			value = locator.value;
		}

		if (using.indexOf('link text') !== -1 && (
			this.capabilities.brokenWhitespaceNormalization || this.capabilities.brokenLinkTextLocator
		)) {
			return this.execute<Element[]>(/* istanbul ignore next */ this._manualFindByLinkText, [using, value, true])
				.then(elements => {
					return elements.map((element: ElementOrElementId) => {
						return new Element(element, this);
					});
				});
		}

		return this.serverPost<any[]>('elements', {
			using: using,
			value: value
		}).then(elements => {
			return elements.map((element: ElementOrElementId) => {
				return new Element(element, this);
			});
		});
	}

	/**
	 * Gets the currently focused element from the focused window/frame.
	 */
	@forCommand({ createsContext: true })
	getActiveElement() {
		const getDocumentActiveElement = () => {
			return this.execute<Element>('return document.activeElement;');
		};

		if (this.capabilities.brokenActiveElement) {
			return getDocumentActiveElement();
		}
		else {
			return this.serverPost<any>('element/active').then((element: ElementOrElementId) => {
				if (element) {
					return new Element(element, this);
				}
				// The driver will return `null` if the active element is the body element; for consistency with how
				// the DOM `document.activeElement` property works, we’ll diverge and always return an element
				else {
					return getDocumentActiveElement();
				}
			});
		}
	}

	/**
	 * Types into the focused window/frame/element.
	 *
	 * @param keys
	 * The text to type in the remote environment. It is possible to type keys that do not have normal character
	 * representations (modifier keys, function keys, etc.) as well as keys that have two different representations
	 * on a typical US-ASCII keyboard (numpad keys); use the values from [[keys]] to type these
	 * special characters. Any modifier keys that are activated by this call will persist until they are
	 * deactivated. To deactivate a modifier key, type the same modifier key a second time, or send `\uE000`
	 * ('NULL') to deactivate all currently active modifier keys.
	 */
	pressKeys(keys: string | string[]) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}

		if (this.capabilities.brokenSendKeys || !this.capabilities.supportsKeysCommand) {
			return this.execute(simulateKeys, [keys]);
		}

		return this.serverPost<void>('keys', {
			value: keys
		});
	}

	/**
	 * Gets the current screen orientation.
	 *
	 * @returns Either 'portrait' or 'landscape'.
	 */
	getOrientation() {
		return this.serverGet<'portrait' | 'landscape'>('orientation').then(function (orientation) {
			return orientation.toLowerCase();
		});
	}

	/**
	 * Sets the screen orientation.
	 *
	 * @param orientation Either 'portrait' or 'landscape'.
	 */
	setOrientation(orientation: string) {
		orientation = orientation.toUpperCase();

		return this.serverPost<void>('orientation', {
			orientation: orientation
		});
	}

	/**
	 * Gets the text displayed in the currently active alert pop-up.
	 */
	getAlertText() {
		return this.serverGet<string>('alert_text');
	}

	/**
	 * Types into the currently active prompt pop-up.
	 *
	 * @param text The text to type into the pop-up’s input box.
	 */
	typeInPrompt(text: string | string[]) {
		if (Array.isArray(text)) {
			text = text.join('');
		}

		return this.serverPost<void>('alert_text', {
			text: text
		});
	}

	/**
	 * Accepts an alert, prompt, or confirmation pop-up. Equivalent to clicking the 'OK' button.
	 */
	acceptAlert() {
		return this.serverPost<void>('accept_alert');
	}

	/**
	 * Dismisses an alert, prompt, or confirmation pop-up. Equivalent to clicking the 'OK' button of an alert pop-up
	 * or the 'Cancel' button of a prompt or confirmation pop-up.
	 */
	dismissAlert() {
		return this.serverPost<void>('dismiss_alert');
	}

	/**
	 * Moves the remote environment’s mouse cursor to the specified element or relative position. If the element is
	 * outside of the viewport, the remote driver will attempt to scroll it into view automatically.
	 *
	 * @param element
	 * The element to move the mouse to. If x-offset and y-offset are not specified, the mouse will be moved to the
	 * centre of the element.
	 *
	 * @param xOffset
	 * The x-offset of the cursor, maybe in CSS pixels, relative to the left edge of the specified element’s
	 * bounding client rectangle. If no element is specified, the offset is relative to the previous position of the
	 * mouse, or to the left edge of the page’s root element if the mouse was never moved before.
	 *
	 * @param yOffset
	 * The y-offset of the cursor, maybe in CSS pixels, relative to the top edge of the specified element’s bounding
	 * client rectangle. If no element is specified, the offset is relative to the previous position of the mouse,
	 * or to the top edge of the page’s root element if the mouse was never moved before.
	 */
	moveMouseTo(): Task<void>;
	moveMouseTo(xOffset?: number, yOffset?: number): Task<void>;
	moveMouseTo(element?: Element, xOffset?: number, yOffset?: number): Task<void>;
	@forCommand({ usesElement: true })
	moveMouseTo(...args: any[]) {
		let [element, xOffset, yOffset] = args;

		if (typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			yOffset = xOffset;
			xOffset = element;
			element = null;
		}

		if (this.capabilities.brokenMouseEvents) {
			return this.execute<void>(simulateMouse, [{
				action: 'mousemove',
				position: this._lastMousePosition,
				element: element,
				xOffset: xOffset,
				yOffset: yOffset
			}]).then((newPosition) => {
				this._lastMousePosition = newPosition;
			});
		}

		if (element) {
			element = element.elementId;
		}
		// If the mouse has not been moved to any element on this page yet, drivers will either throw errors
		// (FirefoxDriver 2.40.0) or silently fail (ChromeDriver 2.9) when trying to move the mouse cursor relative
		// to the "previous" position; in this case, we just assume that the mouse position defaults to the
		// top-left corner of the document
		else if (!this._movedToElement) {
			if (this.capabilities.brokenHtmlMouseMove) {
				return this.execute<Element>('return document.body;').then(element => {
					return element.getPosition().then((position: { x: number, y: number }) => {
						return this.moveMouseTo(element, xOffset - position.x, yOffset - position.y);
					});
				});
			}
			else {
				return this.execute<Element>('return document.documentElement;').then(element => {
					return this.moveMouseTo(element, xOffset, yOffset);
				});
			}
		}

		return this.serverPost<void>('moveto', {
			element: element,
			xoffset: xOffset,
			yoffset: yOffset
		}).then(() => {
			this._movedToElement = true;
		});
	}

	/**
	 * Clicks a mouse button at the point where the mouse cursor is currently positioned. This method may fail to
	 * execute with an error if the mouse has not been moved anywhere since the page was loaded.
	 *
	 * @param button
	 * The button to click. 0 corresponds to the primary mouse button, 1 to the middle mouse button, 2 to the
	 * secondary mouse button. Numbers above 2 correspond to any additional buttons a mouse might provide.
	 */
	clickMouseButton(button?: number) {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute<void>(simulateMouse, [{
				action: 'click',
				button: button,
				position: this._lastMousePosition
			}]);
		}

		return this.serverPost<void>('click', {
			button: button
		}).then(() => {
			// ios-driver 0.6.6-SNAPSHOT April 2014 does not wait until the default action for a click event occurs
			// before returning
			if (this.capabilities.touchEnabled) {
				return sleep(300);
			}
		});
	}

	/**
	 * Depresses a mouse button without releasing it.
	 *
	 * @param button The button to press. See [[Session.click]] for available options.
	 */
	pressMouseButton(button?: number) {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute<void>(simulateMouse, [{
				action: 'mousedown',
				button: button,
				position: this._lastMousePosition
			}]);
		}

		return this.serverPost<void>('buttondown', {
			button: button
		});
	}

	/**
	 * Releases a previously depressed mouse button.
	 *
	 * @param button The button to press. See [[Session.click]] for available options.
	 */
	releaseMouseButton(button?: number) {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute<void>(simulateMouse, [{
				action: 'mouseup',
				button: button,
				position: this._lastMousePosition
			}]);
		}

		return this.serverPost<void>('buttonup', {
			button: button
		});
	}

	/**
	 * Double-clicks the primary mouse button.
	 */
	doubleClick() {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute<void>(simulateMouse, [{
				action: 'dblclick',
				button: 0,
				position: this._lastMousePosition
			}]);
		}

		if (this.capabilities.brokenDoubleClick) {
			return this.pressMouseButton().then(() => {
				return this.releaseMouseButton();
			}).then(() => this.serverPost<void>('doubleclick'));
		}

		return this.serverPost<void>('doubleclick');
	}

	/**
	 * Taps an element on a touch screen device. If the element is outside of the viewport, the remote driver will
	 * attempt to scroll it into view automatically.
	 *
	 * @param element The element to tap.
	 */
	@forCommand({ usesElement: true })
	tap(element: Element) {
		return this.serverPost<void>('touch/click', { element: element.elementId });
	}

	/**
	 * Depresses a new finger at the given point on a touch screen device without releasing it.
	 *
	 * @param x The screen x-coordinate to press, maybe in device pixels.
	 * @param y The screen y-coordinate to press, maybe in device pixels.
	 */
	pressFinger(x: number, y: number) {
		// TODO: If someone specifies the same coordinates as as an existing finger, will it switch the active finger
		// back to that finger instead of adding a new one?
		return this.serverPost<void>('touch/down', { x: x, y: y });
	}

	/**
	 * Releases whatever finger exists at the given point on a touch screen device.
	 *
	 * @param x The screen x-coordinate where a finger is pressed, maybe in device pixels.
	 * @param y The screen y-coordinate where a finger is pressed, maybe in device pixels.
	 */
	releaseFinger(x: number, y: number) {
		return this.serverPost<void>('touch/up', { x: x, y: y });
	}

	/**
	 * Moves the last depressed finger to a new point on the touch screen.
	 *
	 * @param x The screen x-coordinate to move to, maybe in device pixels.
	 * @param y The screen y-coordinate to move to, maybe in device pixels.
	 */
	moveFinger(x: number, y: number) {
		return this.serverPost<void>('touch/move', { x: x, y: y });
	}

	/**
	 * Scrolls the currently focused window on a touch screen device.
	 *
	 * @param element
	 * An element to scroll to. The window will be scrolled so the element is as close to the top-left corner of the
	 * window as possible.
	 *
	 * @param xOffset
	 * An optional x-offset, relative to the left edge of the element, in CSS pixels. If no element is specified,
	 * the offset is relative to the previous scroll position of the window.
	 *
	 * @param yOffset
	 * An optional y-offset, relative to the top edge of the element, in CSS pixels. If no element is specified,
	 * the offset is relative to the previous scroll position of the window.
	 */
	touchScroll(xOffset: number, yOffset: number): Task<void>;
	touchScroll(element?: Element, xOffset?: number, yOffset?: number): Task<void>;
	@forCommand({ usesElement: true })
	touchScroll(...args: any[]) {
		let [element, xOffset, yOffset] = args;
		if (typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			yOffset = xOffset;
			xOffset = element;
			element = undefined;
		}

		if (this.capabilities.brokenTouchScroll) {
			return this.execute<void>(/* istanbul ignore next */ function (element: HTMLElement, x: number, y: number) {
				const rect = { left: window.scrollX, top: window.scrollY };
				if (element) {
					const bbox = element.getBoundingClientRect();
					rect.left += bbox.left;
					rect.top += bbox.top;
				}

				window.scrollTo(rect.left + x, rect.top + y);
			}, [element, xOffset, yOffset]);
		}

		if (element) {
			element = element.elementId;
		}

		// TODO: If using this, please correct for device pixel ratio to ensure consistency
		return this.serverPost<void>('touch/scroll', {
			element: element,
			xoffset: xOffset,
			yoffset: yOffset
		});
	}

	/**
	 * Performs a double-tap gesture on an element.
	 *
	 * @param element The element to double-tap.
	 */
	@forCommand({ usesElement: true })
	doubleTap(element?: Element) {
		const elementId = element && element.elementId;
		return this.serverPost<void>('touch/doubleclick', { element: elementId });
	}

	/**
	 * Performs a long-tap gesture on an element.
	 *
	 * @param element The element to long-tap.
	 */
	@forCommand({ usesElement: true })
	longTap(element?: Element) {
		const elementId = element && element.elementId;
		return this.serverPost<void>('touch/longclick', { element: elementId });
	}

	/**
	 * Flicks a finger. Note that this method is currently badly specified and highly dysfunctional and is only
	 * provided for the sake of completeness.
	 *
	 * @param element The element where the flick should start.
	 * @param xOffset The x-offset in pixels to flick by.
	 * @param yOffset The x-offset in pixels to flick by.
	 * @param speed The speed of the flick, in pixels per *second*. Most human flicks are 100–200ms, so
	 * this value will be higher than expected.
	 */
	flickFinger(element: Element, xOffset: number, yOffset: number, speed?: number): Task<void>;
	flickFinger(xOffset: number, yOffset: number, speed?: number): Task<void>;
	@forCommand({ usesElement: true })
	flickFinger(...args: any[]) {
		let [element, xOffset, yOffset, speed] = args;
		if (typeof speed === 'undefined' && typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			return this.serverPost<void>('touch/flick', {
				xspeed: element,
				yspeed: xOffset
			});
		}

		// if (element) {
		// 	element = element.elementId;
		// }

		return this.serverPost<void>('touch/flick', {
			element: element.elementId,
			xoffset: xOffset,
			yoffset: yOffset,
			speed: speed
		});
	}

	/**
	 * Gets the current geographical location of the remote environment.
	 *
	 * @returns
	 * Latitude and longitude are specified using standard WGS84 decimal latitude/longitude. Altitude is specified
	 * as meters above the WGS84 ellipsoid. Not all environments support altitude.
	 */
	getGeolocation() {
		return this.serverGet<Geolocation>('location').then(location => {
			// ChromeDriver 2.9 ignores altitude being set and then returns 0; to match the Geolocation API
			// specification, we will just pretend that altitude is not supported by the browser at all by
			// changing the value to `null` if it is zero but the last set value was not zero
			if (location.altitude === 0 && this._lastAltitude !== location.altitude) {
				location.altitude = null;
			}

			return location;
		});
	}

	/**
	 * Sets the geographical location of the remote environment.
	 *
	 * @param location
	 * Latitude and longitude are specified using standard WGS84 decimal latitude/longitude. Altitude is specified
	 * as meters above the WGS84 ellipsoid. Not all environments support altitude.
	 */
	setGeolocation(location: Geolocation) {
		// TODO: Is it weird that this accepts an object argument? `setCookie` does too, but nothing else does.
		if (location.altitude !== undefined) {
			this._lastAltitude = location.altitude;
		}

		return this.serverPost<void>('location', { location });
	}

	/**
	 * Gets all logs from the remote environment of the given type. The logs in the remote environment are cleared
	 * once they have been retrieved.
	 *
	 * @param type
	 * The type of log entries to retrieve. Available log types differ between remote environments. Use
	 * [[Session.getAvailableLogTypes]] to learn what log types are currently available. Not all
	 * environments support all possible log types.
	 *
	 * @returns
	 * An array of log entry objects. Timestamps in log entries are Unix timestamps, in seconds.
	 */
	getLogsFor(type: string) {
		return this.serverPost<string[] | LogEntry[]>('log', {
			type: type
		}).then(function (logs) {
			// At least Selendroid 0.9.0 returns logs as an array of strings instead of an array of log objects,
			// which is a spec violation; see https://github.com/selendroid/selendroid/issues/366
			if (!logs) {
				return logs;
			}

			if (isStringArray(logs)) {
				return logs.map(log => {
					const logData = /\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)/.exec(log);
					let entry: LogEntry;

					if (logData) {
						entry = {
							timestamp: Date.parse(logData[1]) / 1000,
							level: logData[2],
							message: logData[3]
						};
					}
					else {
						entry = {
							timestamp: NaN,
							level: 'INFO',
							message: log
						};
					}

					return entry;
				});
			}
			else {
				return logs;
			}
		});
	}

	/**
	 * Gets the types of logs that are currently available for retrieval from the remote environment.
	 */
	getAvailableLogTypes() {
		if (this.capabilities.fixedLogTypes) {
			return Task.resolve<string[]>(this.capabilities.fixedLogTypes);
		}

		return this.serverGet<string[]>('log/types');
	}

	/**
	 * Gets the current state of the HTML5 application cache for the current page.
	 *
	 * @returns
	 * The cache status. One of 0 (uncached), 1 (cached/idle), 2 (checking), 3 (downloading), 4 (update ready), 5
	 * (obsolete).
	 */
	getApplicationCacheStatus() {
		return this.serverGet<number>('application_cache/status');
	}

	/**
	 * Terminates the session. No more commands will be accepted by the remote after this point.
	 */
	quit() {
		return this._server.deleteSession(this._sessionId);
	}

	/**
	 * Searches a document or element subtree for links with the given normalized text. This method works for 'link text'
	 * and 'partial link text' search strategies.
	 *
	 * Note that this method should be passed to an `execute` call, not called directly.
	 *
	 * @param using The strategy in use ('link text' or 'partial link text')
	 * @param value The link text to search for
	 * @param multiple If true, return all matching links
	 * @param element A context element
	 * @returns The found element or elements
	 */
	private _manualFindByLinkText(using: string, value: string, multiple: boolean, element?: HTMLElement) {
		const check = using === 'link text' ? function (linkText: string, text: string) {
			return linkText === text;
		} : function (linkText: string, text: string) {
			return linkText.indexOf(text) !== -1;
		};

		const links = (element || document).getElementsByTagName('a');
		let linkText: string;
		const found: HTMLElement[] = [];

		// if (multiple) {
		// 	var found = [];
		// }

		for (let i = 0; i < links.length; i++) {
			// Normalize the link text whitespace
			linkText = links[i].innerText
				.replace(/^\s+/, '')
				.replace(/\s+$/, '')
				.replace(/\s*\r\n\s*/g, '\n')
				.replace(/ +/g, ' ');
			if (check(linkText, value)) {
				if (!multiple) {
					return links[i];
				}
				found.push(links[i]);
			}
		}

		if (multiple) {
			return found;
		}
	}

	/**
	 * Gets the list of keys set in local storage for the focused window/frame.
	 */
	getLocalStorageKeys() {
		return this.serverGet<string[]>('local_storage');
	}

	/**
	 * Sets a value in local storage for the focused window/frame.
	 *
	 * @param key The key to set.
	 * @param value The value to set.
	 */
	setLocalStorageItem(key: string, value: string) {
		return this.serverPost<void>('local_storage', { key, value });
	}

	/**
	 * Clears all data in local storage for the focused window/frame.
	 */
	clearLocalStorage() {
		return this.serverDelete<void>('local_storage');
	}

	/**
	 * Gets a value from local storage for the focused window/frame.
	 *
	 * @param key The key of the data to get.
	 */
	getLocalStorageItem(key: string) {
		return this.serverGet<string>('local_storage/key/$0', null, [key]);
	}

	/**
	 * Deletes a value from local storage for the focused window/frame.
	 *
	 * @param key The key of the data to delete.
	 */
	deleteLocalStorageItem(key: string) {
		return this.serverDelete<void>('local_storage/key/$0', null, [key]);
	}

	/**
	 * Gets the number of keys set in local storage for the focused window/frame.
	 */
	getLocalStorageLength() {
		return this.serverGet<number>('local_storage/size');
	}

	/**
	 * Gets the list of keys set in session storage for the focused window/frame.
	 */
	getSessionStorageKeys() {
		return this.serverGet<string[]>('session_storage');
	}

	/**
	 * Sets a value in session storage for the focused window/frame.
	 *
	 * @param key The key to set.
	 * @param value The value to set.
	 */
	setSessionStorageItem(key: string, value: string) {
		return this.serverPost<void>('session_storage', { key, value });
	}

	/**
	 * Clears all data in session storage for the focused window/frame.
	 */
	clearSessionStorage() {
		return this.serverDelete<void>('session_storage');
	}

	/**
	 * Gets a value from session storage for the focused window/frame.
	 *
	 * @param key The key of the data to get.
	 */
	getSessionStorageItem(key: string) {
		return this.serverGet<string>('session_storage/key/$0', null, [key]);
	}

	/**
	 * Deletes a value from session storage for the focused window/frame.
	 *
	 * @param key The key of the data to delete.
	 */
	deleteSessionStorageItem(key: string) {
		return this.serverDelete<void>('session_storage/key/$0', null, [key]);
	}

	/**
	 * Gets the number of keys set in session storage for the focused window/frame.
	 */
	getSessionStorageLength() {
		return this.serverGet<number>('session_storage/size');
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element in the currently active window/frame
	 * matching the given query. This is inherently slower than [[Session.find]], so should only be
	 * used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 *
	 * @param using
	 * The element retrieval strategy to use. See [[Session.find]] for options.
	 *
	 * @param value
	 * The strategy-specific value to search for. See [[Session.find]] for details.
	 */
	findDisplayed(using: Strategy, value: string) {
		return findDisplayed(this, this, using, value);
	}

	/**
	 * Waits for all elements in the currently active window/frame to be destroyed.
	 *
	 * @param using
	 * The element retrieval strategy to use. See [[Session.find]] for options.
	 *
	 * @param value
	 * The strategy-specific value to search for. See [[Session.find]] for details.
	 */
	waitForDeleted(using: Strategy, value: string) {
		return waitForDeleted(this, this, using, value);
	}

	/**
	 * Gets the timeout for [[Session.executeAsync]] calls.
	 */
	getExecuteAsyncTimeout() {
		return this.getTimeout('script');
	}

	/**
	 * Sets the timeout for [[Session.executeAsync]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setExecuteAsyncTimeout(ms: number) {
		return this.setTimeout('script', ms);
	}

	/**
	 * Gets the timeout for [[Session.find]] calls.
	 */
	getFindTimeout() {
		return this.getTimeout('implicit');
	}

	/**
	 * Sets the timeout for [[Session.find]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setFindTimeout(ms: number) {
		return this.setTimeout('implicit', ms);
	}

	/**
	 * Gets the timeout for [[Session.get]] calls.
	 */
	getPageLoadTimeout() {
		return this.getTimeout('page load');
	}

	/**
	 * Sets the timeout for [[Session.get]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setPageLoadTimeout(ms: number) {
		return this.setTimeout('page load', ms);
	}
}

export interface SessionError extends Error {
	status?: keyof typeof statusCodes;
}

/**
 * Decorator for the [[util.forCommand]] method
 */
function forCommand(properties: { usesElement?: boolean, createsContext?: boolean }) {
	return function (target: any, property: string, descriptor: PropertyDescriptor) {
		const fn = <Function>target[property];
		descriptor.value = utilForCommand(fn, properties);
	};
}

/**
 * Finds and converts serialised DOM element objects into fully-featured typed Elements.
 *
 * @private
 * @param session The session from which the Element was retrieved.
 * @param value An object or array that may be, or may contain, serialised DOM element objects.
 * @returns The input value, with all serialised DOM element objects converted to typed Elements.
 */
function convertToElements(session: Session, value: any) {
	// TODO: Unit test elements attached to objects
	function convert(value: any) {
		if (Array.isArray(value)) {
			value = value.map(convert);
		}
		else if (typeof value === 'object' && value !== null) {
			if (value.ELEMENT) {
				value = new Element(value, session);
			}
			else {
				for (let k in value) {
					value[k] = convert(value[k]);
				}
			}
		}

		return value;
	}

	return convert(value);
}

/**
 * As of Selenium 2.40.0 (March 2014), all drivers incorrectly transmit an UnknownError instead of a
 * JavaScriptError when user code fails to execute correctly. This method corrects this status code, under the
 * assumption that drivers will follow the spec in future.
 *
 * @private
 */
function fixExecuteError(error: SessionError) {
	if (error.name === 'UnknownError') {
		error.status = '17';
		error.name = statusCodes[error.status][0];
	}

	throw error;
}

/**
 * HTTP cookies are transmitted as semicolon-delimited strings, with a `key=value` pair giving the cookie’s name and
 * value, then additional information about the cookie (expiry, path, domain, etc.) as additional k-v pairs. This
 * method takes an Array describing the parts of a cookie (`target`), and a hash map containing the additional
 * information (`source`), and pushes the properties from the source object onto the target array as properly
 * escaped key-value strings.
 *
 * @private
 */
function pushCookieProperties(target: any[], source: any) {
	Object.keys(source).forEach(function (key) {
		let value = source[key];

		if (key === 'name' || key === 'value' || (key === 'domain' && value === 'http')) {
			return;
		}

		if (typeof value === 'boolean') {
			value && target.push(key);
		}
		// JsonWireProtocol uses the key 'expiry' but JavaScript cookies use the key 'expires'
		else if (key === 'expiry') {
			if (typeof value === 'number') {
				value = new Date(value * 1000);
			}

			if (value instanceof Date) {
				value = value.toUTCString();
			}

			target.push('expires=' + encodeURIComponent(value));
		}
		else {
			target.push(key + '=' + encodeURIComponent(value));
		}
	});
}

/* istanbul ignore next */
/**
 * Simulates a keyboard event as it would occur on Safari 7.
 *
 * @private
 * @param keys Keys to type.
 */
function simulateKeys(keys: string[]) {
	const target = <any>document.activeElement;

	function dispatch(kwArgs: any) {
		let event: KeyboardEvent;

		if (typeof KeyboardEvent === 'function') {
			event = new KeyboardEvent(kwArgs.type, {
				bubbles: true,
				cancelable: kwArgs.cancelable || false,
				view: window,
				key: kwArgs.key || '',
				location: 3
			});
		}
		else {
			event = document.createEvent('KeyboardEvent');
			event.initKeyboardEvent(
				kwArgs.type,
				true,
				kwArgs.cancelable || false,
				window,
				kwArgs.key || '',
				3,
				'',
				<any>0,
				''
			);
		}

		return target.dispatchEvent(event);
	}

	function dispatchInput() {
		let event: Event;
		if (typeof Event === 'function') {
			event = new Event('input', { bubbles: true, cancelable: false });
		}
		else {
			event = document.createEvent('Event');
			event.initEvent('input', true, false);
		}
		return target.dispatchEvent(event);
	}

	keys = [].concat(...keys.map(function (keys) {
		return keys.split('');
	}));

	for (let i = 0, j = keys.length; i < j; ++i) {
		const key = keys[i];
		let performDefault = true;

		performDefault = dispatch({ type: 'keydown', cancelable: true, key: key });
		performDefault = performDefault && dispatch({ type: 'keypress', cancelable: true, key: key });

		if (performDefault) {
			if ('value' in target) {
				target.value = target.value.slice(0, target.selectionStart) + key +
					target.value.slice(target.selectionEnd);
				dispatchInput();
			}
			else if (target.isContentEditable) {
				let node = document.createTextNode(key);
				let selection = window.getSelection();
				let range = selection.getRangeAt(0);
				range.deleteContents();
				range.insertNode(node);
				range.setStartAfter(node);
				range.setEndAfter(node);
				selection.removeAllRanges();
				selection.addRange(range);
			}
		}

		dispatch({ type: 'keyup', cancelable: true, key: key });
	}
}

/* istanbul ignore next */
/**
 * Simulates a mouse event as it would occur on Safari 7.
 *
 * @private
 * @param kwArgs Parameters for the mouse event.
 */
function simulateMouse(kwArgs: any) {
	let position = kwArgs.position;

	function dispatch(kwArgs: any) {
		let event: MouseEvent;
		if (typeof MouseEvent === 'function') {
			event = new MouseEvent(kwArgs.type, {
				bubbles: 'bubbles' in kwArgs ? kwArgs.bubbles : true,
				cancelable: kwArgs.cancelable || false,
				view: window,
				detail: kwArgs.detail || 0,
				screenX: window.screenX + position.x,
				screenY: window.screenY + position.y,
				clientX: position.x,
				clientY: position.y,
				ctrlKey: kwArgs.ctrlKey || false,
				shiftKey: kwArgs.shiftKey || false,
				altKey: kwArgs.altKey || false,
				metaKey: kwArgs.metaKey || false,
				button: kwArgs.button || 0,
				relatedTarget: kwArgs.relatedTarget
			});
		}
		else {
			event = document.createEvent('MouseEvents');
			event.initMouseEvent(
				kwArgs.type,
				kwArgs.bubbles || true,
				kwArgs.cancelable || false,
				window,
				kwArgs.detail || 0,
				window.screenX + position.x,
				window.screenY + position.y,
				position.x,
				position.y,
				kwArgs.ctrlKey || false,
				kwArgs.altKey || false,
				kwArgs.shiftKey || false,
				kwArgs.metaKey || false,
				kwArgs.button || 0,
				kwArgs.relatedTarget || null
			);

		}

		return kwArgs.target.dispatchEvent(event);
	}

	function click(target: any, button: any, detail: any) {
		if (!down(target, button)) {
			return false;
		}

		if (!up(target, button)) {
			return false;
		}

		return dispatch({
			button: button,
			cancelable: true,
			detail: detail,
			target: target,
			type: 'click'
		});
	}

	function down(target: any, button: any) {
		return dispatch({
			button: button,
			cancelable: true,
			target: target,
			type: 'mousedown'
		});
	}

	function up(target: any, button: any) {
		return dispatch({
			button: button,
			cancelable: true,
			target: target,
			type: 'mouseup'
		});
	}

	function move(currentElement: HTMLElement, newElement: HTMLElement, xOffset: number, yOffset: number) {
		if (newElement) {
			const bbox = newElement.getBoundingClientRect();

			if (xOffset == null) {
				xOffset = (bbox.right - bbox.left) * 0.5;
			}

			if (yOffset == null) {
				yOffset = (bbox.bottom - bbox.top) * 0.5;
			}

			position = { x: bbox.left + xOffset, y: bbox.top + yOffset };
		}
		else {
			position.x += xOffset || 0;
			position.y += yOffset || 0;

			newElement = <HTMLElement>document.elementFromPoint(position.x, position.y);
		}

		if (currentElement !== newElement) {
			dispatch({ type: 'mouseout', target: currentElement, relatedTarget: newElement });
			dispatch({ type: 'mouseleave', target: currentElement, relatedTarget: newElement, bubbles: false });
			dispatch({ type: 'mouseenter', target: newElement, relatedTarget: currentElement, bubbles: false });
			dispatch({ type: 'mouseover', target: newElement, relatedTarget: currentElement });
		}

		dispatch({ type: 'mousemove', target: newElement, bubbles: true });

		return position;
	}

	const target = <HTMLElement>document.elementFromPoint(position.x, position.y);

	if (kwArgs.action === 'mousemove') {
		return move(target, kwArgs.element, kwArgs.xOffset, kwArgs.yOffset);
	}
	else if (kwArgs.action === 'mousedown') {
		return down(target, kwArgs.button);
	}
	else if (kwArgs.action === 'mouseup') {
		return up(target, kwArgs.button);
	}
	else if (kwArgs.action === 'click') {
		return click(target, kwArgs.button, 0);
	}
	else if (kwArgs.action === 'dblclick') {
		if (!click(target, kwArgs.button, 0)) {
			return false;
		}

		if (!click(target, kwArgs.button, 1)) {
			return false;
		}

		return dispatch({
			type: 'dblclick',
			target: target,
			button: kwArgs.button,
			detail: 2,
			cancelable: true
		});
	}
}

function isStringArray(value: any): value is string[] {
	return Array.isArray(value) && typeof value[0] === 'string';
}
