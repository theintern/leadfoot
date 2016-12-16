import Element, { ElementOrElementId } from './Element';
import Server from './Server';
import FindDisplayed from './lib/findDisplayed';
import * as lang from 'dojo/lang';
import Promise = require('dojo/Promise');
import statusCodes from './lib/statusCodes';
import Strategies from './lib/strategies';
import * as util from './lib/util';
import WaitForDeleted from './lib/waitForDeleted';
import { Capabilities, Geolocation, LogEntry, WebDriverCookie } from './interfaces';

/**
 * Decorator for the [[util.forCommand]] method
 */
function forCommand(properties: { usesElement?: boolean, createsContext?: boolean }) {
	return function (target: any, property: string, descriptor: PropertyDescriptor) {
		const fn = <Function> target[property];
		descriptor.value = util.forCommand(fn, properties);
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
function fixExecuteError(error: any) {
	if (error.name === 'UnknownError') {
		error.status = 17;
		error.name = (<any> statusCodes)[error.status][0];
	}

	throw error;
}

function noop() {
	// At least ios-driver 0.6.6 returns an empty object for methods that are supposed to return no value at all,
	// which is not correct
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
function pushCookieProperties(target: any[], source: any): void {
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
				value = (<any> Date).toUTCString();
			}

			target.push('expires=' + encodeURIComponent(value));
		}
		else {
			target.push(key + '=' + encodeURIComponent(value));
		}
	});
}

/**
 * Returns the actual response value from the remote environment.
 *
 * @private
 * @param response JsonWireProtocol response object.
 * @returns The actual response value.
 */
function returnValue(response: any): any {
	return response.value;
}

/* istanbul ignore next */
/**
 * Simulates a keyboard event as it would occur on Safari 7.
 *
 * @private
 * @param keys Keys to type.
 */
function simulateKeys(keys: string[]): void {
	const target = <any> document.activeElement;

	function dispatch(kwArgs: any) {
		const event = document.createEvent('KeyboardEvent');
		event.initKeyboardEvent(
			kwArgs.type,
			kwArgs.bubbles || true,
			kwArgs.cancelable || false,
			window,
			kwArgs.key || '',
			kwArgs.location || 3,
			kwArgs.modifiers || '',
			kwArgs.repeat || 0,
			kwArgs.locale || ''
		);

		return target.dispatchEvent(event);
	}

	function dispatchInput() {
		const event = document.createEvent('Event');
		event.initEvent('input', true, false);
		return target.dispatchEvent(event);
	}

	keys = Array.prototype.concat.apply([], keys.map(function (keys) {
		return keys.split('');
	}));

	for (let i = 0, j = keys.length; i < j; ++i) {
		let key = keys[i];
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
		const event = document.createEvent('MouseEvents');
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

			newElement = <HTMLElement> document.elementFromPoint(position.x, position.y);
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

	const target = <HTMLElement> document.elementFromPoint(position.x, position.y);

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

export default class Session extends Strategies<Promise<Element>, Promise<Element[]>, Promise<void>>
							implements WaitForDeleted<Promise<Element>, Promise<void>>,
								FindDisplayed<Promise<Element>> {
	private _sessionId: string;
	private _server: Server;
	private _capabilities: Capabilities;
	private _closedWindows: any = null;
	// TODO: Timeouts are held so that we can fiddle with the implicit wait timeout to add efficient `waitFor`
	// and `waitForDeleted` convenience methods. Technically only the implicit timeout is necessary.
	private _timeouts: { [key: string]: Promise<number>; } = {};
	private _movedToElement: boolean = false;
	private _lastMousePosition: any = null;
	private _lastAltitude: any = null;
	private _nextRequest: Promise<any>;

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
			script: Promise.resolve(0),
			implicit: Promise.resolve(0),
			'page load': Promise.resolve(Infinity)
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
	private _delegateToServer(method: string, path: string, requestData: any, pathParts?: string[]): Promise<any> {
		path = 'session/' + this._sessionId + (path ? ('/' + path) : '');

		return new Promise((resolve, reject, progress, setCanceller) => {
			let cancelled = false;
			const self = this;
			setCanceller(function (reason: Error|string) {
				cancelled = true;
				throw reason;
			});

			// The promise is cleared from `_nextRequest` once it has been resolved in order to avoid
			// infinitely long chains of promises retaining values that are not used any more
			let thisRequest: Promise<any>;
			function clearNextRequest() {
				if (self._nextRequest === thisRequest) {
					self._nextRequest = null;
				}
			}

			function runRequest() {
				// `runRequest` is normally called once the previous request is finished. If this request
				// is cancelled before the previous request is finished, then it should simply never run.
				// (This Promise will have been rejected already by the cancellation.)
				if (cancelled) {
					clearNextRequest();
					return;
				}

				const response = (<any> self._server)[method](path, requestData, pathParts).then(returnValue);
				response.finally(clearNextRequest);

				// The value of the response always needs to be taken directly from the server call
				// rather than from the chained `_nextRequest` promise, since if an undefined value is
				// returned by the server call and that value is returned through `finally(runRequest)`,
				// the *previous* Promise’s resolved value will be used as the resolved value, which is
				// wrong
				resolve(response);

				return response;
			}

			// At least ChromeDriver 2.19 will just hard close connections if parallel requests are made to the server,
			// so any request sent to the server for a given session must be serialised. Other servers like Selendroid
			// have been known to have issues with parallel requests as well, so serialisation is applied universally,
			// even though it has negative performance implications
			if (self._nextRequest) {
				thisRequest = self._nextRequest = self._nextRequest.finally(runRequest);
			}
			else {
				thisRequest = self._nextRequest = runRequest();
			}
		});
	}

	private _get(path: string, requestData?: any, pathParts?: string[]): Promise<any> {
		return this._delegateToServer('_get', path, requestData, pathParts);
	}

	private _post(path: string, requestData?: any, pathParts?: string[]): Promise<any> {
		return this._delegateToServer('_post', path, requestData, pathParts);
	}

	private _delete(path: string, requestData?: any, pathParts?: string[]): Promise<any> {
		return this._delegateToServer('_delete', path, requestData, pathParts);
	}

	/**
	 * Gets the current value of a timeout for the session.
	 *
	 * @param type The type of timeout to retrieve. One of 'script', 'implicit', or 'page load'.
	 * @returns The timeout, in milliseconds.
	 */
	getTimeout(type: string): Promise<number> {
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
	setTimeout(type: string, ms: number): Promise<void> {
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

		const promise = this._post('timeouts', {
			type: type,
			ms: ms
		}).catch(error => {
			// Appium as of April 2014 complains that `timeouts` is unsupported, so try the more specific
			// endpoints if they exist
			if (error.name === 'UnknownCommand') {
				if (type === 'script') {
					return this._post('timeouts/async_script', { ms: ms });
				}
				else if (type === 'implicit') {
					return this._post('timeouts/implicit_wait', { ms: ms });
				}
			}

			throw error;
		}).then(noop);

		this._timeouts[type] = promise.then(function () {
			return ms;
		});

		return promise;
	}

	/**
	 * Gets the identifier for the window that is currently focused.
	 *
	 * @returns A window handle identifier that can be used with other window handling functions.
	 */
	getCurrentWindowHandle(): Promise<string> {
		return this._get('window_handle').then(handle => {
			if (this.capabilities.brokenDeleteWindow && this._closedWindows[handle]) {
				const error: any = new Error();
				error.status = 23;
				error.name = (<any> statusCodes)[error.status][0];
				error.message = (<any> statusCodes)[error.status][1];
				throw error;
			}

			return handle;
		});
	}

	/**
	 * Gets a list of identifiers for all currently open windows.
	 */
	getAllWindowHandles(): Promise<string[]> {
		return this._get('window_handles').then((handles: string[]) => {
			if (this.capabilities.brokenDeleteWindow) {
				return handles.filter(handle => { return !this._closedWindows[handle]; });
			}

			return handles;
		});
	}

	/**
	 * Gets the URL that is loaded in the focused window/frame.
	 */
	getCurrentUrl(): Promise<string> {
		return this._get('url');
	}

	/**
	 * Navigates the focused window/frame to a new URL.
	 */
	get(url: string): Promise<void> {
		this._movedToElement = false;

		if (this.capabilities.brokenMouseEvents) {
			this._lastMousePosition = { x: 0, y: 0 };
		}

		return this._post('url', {
			url: url
		}).then(noop);
	}

	/**
	 * Navigates the focused window/frame forward one page using the browser’s navigation history.
	 */
	goForward(): Promise<void> {
		// TODO: SPEC: Seems like this and `back` should return the newly navigated URL.
		return this._post('forward').then(noop);
	}

	/**
	 * Navigates the focused window/frame back one page using the browser’s navigation history.
	 */
	goBack(): Promise<void> {
		return this._post('back').then(noop);
	}

	/**
	 * Reloads the current browser window/frame.
	 */
	refresh(): Promise<void> {
		if (this.capabilities.brokenRefresh) {
			return this.execute('location.reload();');
		}

		return this._post('refresh').then(noop);
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
	execute(script: Function|string, args?: any[]): Promise<any> {
		// At least FirefoxDriver 2.40.0 will throw a confusing NullPointerException if args is not an array;
		// provide a friendlier error message to users that accidentally pass a non-array
		if (typeof args !== 'undefined' && !Array.isArray(args)) {
			throw new Error('Arguments passed to execute must be an array');
		}

		let result = this._post('execute', {
			script: util.toExecuteString(script),
			args: args || []
		}).then(<any> lang.partial(convertToElements, this), fixExecuteError);

		if (this.capabilities.brokenExecuteUndefinedReturn) {
			result = result.then(function (value: any) {
				if (value === undefined) {
					value = null;
				}

				return value;
			});
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
	executeAsync(script: Function|string, args?: any[]): Promise<any> {
		// At least FirefoxDriver 2.40.0 will throw a confusing NullPointerException if args is not an array;
		// provide a friendlier error message to users that accidentally pass a non-array
		if (typeof args !== 'undefined' && !Array.isArray(args)) {
			throw new Error('Arguments passed to executeAsync must be an array');
		}

		return this._post('execute_async', {
			script: util.toExecuteString(script),
			args: args || []
		}).then(<any> lang.partial(convertToElements, this), fixExecuteError);
	}

	/**
	 * Gets a screenshot of the focused window and returns it in PNG format.
	 *
	 * @returns A buffer containing a PNG image.
	 */
	takeScreenshot(): Promise<Buffer> {
		return this._get('screenshot').then(function (data) {
			/*jshint node:true */
			return new Buffer(data, 'base64');
		});
	}

	/**
	 * Gets a list of input method editor engines available to the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	getAvailableImeEngines(): Promise<string[]> {
		return this._get('ime/available_engines');
	}

	/**
	 * Gets the currently active input method editor for the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	getActiveImeEngine(): Promise<string> {
		return this._get('ime/active_engine');
	}

	/**
	 * Returns whether or not an input method editor is currently active in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	isImeActivated(): Promise<boolean> {
		return this._get('ime/activated');
	}

	/**
	 * Deactivates any active input method editor in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 */
	deactivateIme(): Promise<void> {
		return this._post('ime/deactivate');
	}

	/**
	 * Activates an input method editor in the remote environment.
	 * As of April 2014, no known remote environments support IME functions.
	 *
	 * @param engine The type of IME to activate.
	 */
	activateIme(engine: string): Promise<void> {
		return this._post('ime/activate', {
			engine: engine
		});
	}

	/**
	 * Switches the currently focused frame to a new frame.
	 *
	 * @param id
	 * The frame to switch to. In most environments, a number or string value corresponds to a key in the
	 * `window.frames` object of the currently active frame. If `null`, the topmost (default) frame will be used.
	 * If an Element is provided, it must correspond to a `<frame>` or `<iframe>` element.
	 */
	switchToFrame(id: string|number|Element): Promise<void> {
		return this._post('frame', {
			id: id
		}).then(noop);
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
	switchToWindow(handle: string): Promise<void> {
		return this._post('window', {
			// TODO: Note that in the W3C standard, the property is 'handle'
			name: handle
		}).then(noop);
	}

	/**
	 * Switches the currently focused frame to the parent of the currently focused frame.
	 */
	switchToParentFrame(): Promise<void> {
		return this._post('frame/parent').catch(error => {
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

				return this.execute('return window.parent.frameElement;').then(parent => {
					// TODO: Using `null` if no parent frame was returned keeps the request from being invalid,
					// but may be incorrect and may cause incorrect frame retargeting on certain platforms;
					// At least Selendroid 0.9.0 fails both commands
					return this.switchToFrame(parent || null);
				});
			}

			throw error;
		}).then(noop);
	}

	/**
	 * Closes the currently focused window. In most environments, after the window has been closed, it is necessary
	 * to explicitly switch to whatever window is now focused.
	 */
	closeCurrentWindow(): Promise<void> {
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

		return this._delete('window').catch(error => {
			// ios-driver 0.6.6-SNAPSHOT April 2014 does not implement close window command
			if (error.name === 'UnknownCommand') {
				this.capabilities.brokenDeleteWindow = true;
				return manualClose();
			}

			throw error;
		}).then(noop);
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
	setWindowSize(width: number, height: number): Promise<void>;
	setWindowSize(windowHandle: string, width: number, height: number): Promise<void>;
	setWindowSize(...args: any[]): Promise<void> {
		let [windowHandle, width, height ] = args;

		if (typeof height === 'undefined') {
			height = width;
			width = windowHandle;
			windowHandle = null;
		}

		const data = {
			width: width,
			height: height
		};

		if (this.capabilities.implicitWindowHandles) {
			if (windowHandle == null) {
				return this._post('window/size', data);
			}
			else {
				// User provided a window handle; get the current handle, switch to the new one, get the size, then
				// switch back to the original handle.
				let error: Error;
				return this.getCurrentWindowHandle().then(originalHandle => {
					return this.switchToWindow(windowHandle).then(() => {
						return this._post('window/size', data);
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
			return this._post('window/$0/size', {
				width: width,
				height: height
			}, [ windowHandle ]).then(noop);
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
	getWindowSize(windowHandle?: string): Promise<{ width: number, height: number }> {
		if (this.capabilities.implicitWindowHandles) {
			if (windowHandle == null) {
				return this._get('window/size');
			}
			else {
				// User provided a window handle; get the current handle, switch to the new one, get the size, then
				// switch back to the original handle.
				let error: Error;
				let size: { width: number, height: number };
				return this.getCurrentWindowHandle().then(originalHandle => {
					return this.switchToWindow(windowHandle).then(() => {
						return this._get('window/size');
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
			return this._get('window/$0/size', null, [ windowHandle ]);
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
	setWindowPosition(x: number, y: number): Promise<void>;
	setWindowPosition(windowHandle: string, x: number, y: number): Promise<void>;
	setWindowPosition(...args: any[]): Promise<void> {
		let [ windowHandle, x, y ] = args;

		if (typeof y === 'undefined') {
			y = x;
			x = windowHandle;
			windowHandle = 'current';
		}

		return this._post('window/$0/position', {
			x: x,
			y: y
		}, [ windowHandle ]).then(noop);
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
	getWindowPosition(windowHandle?: string): Promise<{ x: number, y: number }> {
		if (typeof windowHandle === 'undefined') {
			windowHandle = 'current';
		}

		return this._get('window/$0/position', null, [ windowHandle ]).then(function (position) {
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
	maximizeWindow(windowHandle?: string): Promise<void> {
		if (typeof windowHandle === 'undefined') {
			windowHandle = 'current';
		}

		return this._post('window/$0/maximize', null, [ windowHandle ]).then(noop);
	}

	/**
	 * Gets all cookies set on the current page.
	 */
	getCookies(): Promise<WebDriverCookie[]> {
		return this._get('cookie').then(function (cookies: WebDriverCookie[]) {
			// At least SafariDriver 2.41.0 returns cookies with extra class and hCode properties that should not
			// exist
			return cookies.map(function (badCookie) {
				let cookie: any = {};
				for (let key in badCookie) {
					if (key === 'name' || key === 'value' || key === 'path' || key === 'domain' ||
						key === 'secure' || key === 'httpOnly' || key === 'expiry'
					) {
						cookie[key] = (<any> badCookie)[key];
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
	setCookie(cookie: WebDriverCookie): Promise<void> {
		if (typeof cookie.expiry === 'string') {
			cookie.expiry = new Date(cookie.expiry);
		}

		if (cookie.expiry instanceof Date) {
			cookie.expiry = cookie.expiry.valueOf() / 1000;
		}
		const self = this;

		return this._post('cookie', {
			cookie: cookie
		}).catch(function (error: any) {
			// At least ios-driver 0.6.0-SNAPSHOT April 2014 does not know how to set cookies
			if (error.name === 'UnknownCommand') {
				// Per RFC6265 section 4.1.1, cookie names must match `token` (any US-ASCII character except for
				// control characters and separators as defined in RFC2616 section 2.2)
				if (/[^A-Za-z0-9!#$%&'*+.^_`|~-]/.test(cookie.name)) {
					error = new Error();
					error.status = 25;
					error.name = (<any> statusCodes)[error.status[0]];
					error.message = 'Invalid cookie name';
					throw error;
				}

				if (/[^\u0021\u0023-\u002b\u002d-\u003a\u003c-\u005b\u005d-\u007e]/.test(cookie.value)) {
					error = new Error();
					error.status = 25;
					error.name = (<any> statusCodes)[error.status[0]];
					error.message = 'Invalid cookie value';
					throw error;
				}

				const cookieToSet = [ cookie.name + '=' + cookie.value ];

				pushCookieProperties(cookieToSet, cookie);

				return self.execute(/* istanbul ignore next */ function (cookie: any) {
					document.cookie = cookie;
				}, [ cookieToSet.join(';') ]);
			}

			throw error;
		}).then(noop);
	}

	/**
	 * Clears all cookies for the current page.
	 */
	clearCookies(): Promise<void> {
		return this._delete('cookie').then(noop);
	}

	/**
	 * Deletes a cookie on the current page.
	 *
	 * @param name The name of the cookie to delete.
	 */
	deleteCookie(name: string): Promise<void> {
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
						cookie.name + '=',
						'expires=Thu, 01 Jan 1970 00:00:00 GMT'
					];

					pushCookieProperties(expiredCookie, cookie);

					return this.execute(/* istanbul ignore next */ function (expiredCookie: any) {
						document.cookie = expiredCookie + ';domain=' + encodeURIComponent(document.domain);
					}, [ expiredCookie.join(';') ]);
				}
			});
		}

		return this._delete('cookie/$0', null, [ name ]).then(noop);
	}

	/**
	 * Gets the HTML loaded in the focused window/frame. This markup is serialised by the remote environment so
	 * may not exactly match the HTML provided by the Web server.
	 */
	getPageSource(): Promise<string> {
		if (this.capabilities.brokenPageSource) {
			return this.execute(/* istanbul ignore next */ function () {
				return document.documentElement.outerHTML;
			});
		}
		else {
			return this._get('source');
		}
	}

	/**
	 * Gets the title of the top-level browsing context of the current window or tab.
	 */
	getPageTitle(): Promise<string> {
		return this._get('title');
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
	find(using: string, value: string): Promise<Element> {
		if (using.indexOf('link text') !== -1 && this.capabilities.brokenWhitespaceNormalization) {
			return this.execute(/* istanbul ignore next */ this._manualFindByLinkText, [ using, value ])
				.then(element => {
					if (!element) {
						const error = new Error();
						error.name = 'NoSuchElement';
						throw error;
					}
					return new Element(element, this);
				});
		}

		return this._post('element', {
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
	findAll(using: string, value: string): Promise<Element[]> {
		if (using.indexOf('link text') !== -1 && this.capabilities.brokenWhitespaceNormalization) {
			return this.execute(/* istanbul ignore next */ this._manualFindByLinkText, [ using, value, true ])
				.then(elements => {
					return elements.map((element: ElementOrElementId) => {
						return new Element(element, this);
					});
				});
		}

		return this._post('elements', {
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
	getActiveElement(): Promise<Element> {
		const getDocumentActiveElement = () => {
			return this.execute('return document.activeElement;');
		};

		if (this.capabilities.brokenActiveElement) {
			return getDocumentActiveElement();
		}
		else {
			return this._post('element/active').then((element: ElementOrElementId) => {
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
	pressKeys(keys: string|string[]): Promise<void> {
		if (!Array.isArray(keys)) {
			keys = [ keys ];
		}

		if (this.capabilities.brokenSendKeys || !this.capabilities.supportsKeysCommand) {
			return this.execute(simulateKeys, [ keys ]);
		}

		return this._post('keys', {
			value: keys
		}).then(noop);
	}

	/**
	 * Gets the current screen orientation.
	 *
	 * @returns Either 'portrait' or 'landscape'.
	 */
	getOrientation(): Promise<'portrait'|'landscape'> {
		return this._get('orientation').then(function (orientation) {
			return orientation.toLowerCase();
		});
	}

	/**
	 * Sets the screen orientation.
	 *
	 * @param orientation Either 'portrait' or 'landscape'.
	 */
	setOrientation(orientation: string): Promise<void> {
		orientation = orientation.toUpperCase();

		return this._post('orientation', {
			orientation: orientation
		}).then(noop);
	}

	/**
	 * Gets the text displayed in the currently active alert pop-up.
	 */
	getAlertText(): Promise<string> {
		return this._get('alert_text');
	}

	/**
	 * Types into the currently active prompt pop-up.
	 *
	 * @param text The text to type into the pop-up’s input box.
	 */
	typeInPrompt(text: string|string[]): Promise<void> {
		if (Array.isArray(text)) {
			text = text.join('');
		}

		return this._post('alert_text', {
			text: text
		}).then(noop);
	}

	/**
	 * Accepts an alert, prompt, or confirmation pop-up. Equivalent to clicking the 'OK' button.
	 */
	acceptAlert(): Promise<void> {
		return this._post('accept_alert').then(noop);
	}

	/**
	 * Dismisses an alert, prompt, or confirmation pop-up. Equivalent to clicking the 'OK' button of an alert pop-up
	 * or the 'Cancel' button of a prompt or confirmation pop-up.
	 */
	dismissAlert(): Promise<void> {
		return this._post('dismiss_alert').then(noop);
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
	moveMouseTo(): Promise<void>;
	moveMouseTo(xOffset?: number, yOffset?: number): Promise<void>;
	moveMouseTo(element?: Element, xOffset?: number, yOffset?: number): Promise<void>;
	@forCommand({ usesElement: true })
	moveMouseTo(...args: any[]): Promise<void> {
		let [ element, xOffset, yOffset ] = args;

		if (typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			yOffset = xOffset;
			xOffset = element;
			element = null;
		}

		if (this.capabilities.brokenMouseEvents) {
			return this.execute(simulateMouse, [ {
				action: 'mousemove',
				position: this._lastMousePosition,
				element: element,
				xOffset: xOffset,
				yOffset: yOffset
			} ]).then((newPosition) => {
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
				return this.execute('return document.body;').then(element => {
					return element.getPosition().then((position: { x: number, y: number }) => {
						return this.moveMouseTo(element, xOffset - position.x, yOffset - position.y);
					});
				});
			}
			else {
				return this.execute('return document.documentElement;').then(element => {
					return this.moveMouseTo(element, xOffset, yOffset);
				});
			}
		}

		return this._post('moveto', {
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
	clickMouseButton(button?: number): Promise<void> {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute(simulateMouse, [ {
				action: 'click',
				button: button,
				position: this._lastMousePosition
			} ]).then(noop);
		}

		return this._post('click', {
			button: button
		}).then(() => {
			// ios-driver 0.6.6-SNAPSHOT April 2014 does not wait until the default action for a click event occurs
			// before returning
			if (this.capabilities.touchEnabled) {
				return util.sleep(300);
			}
		});
	}

	/**
	 * Depresses a mouse button without releasing it.
	 *
	 * @param button The button to press. See [[Session.click]] for available options.
	 */
	pressMouseButton(button?: number): Promise<void> {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute(simulateMouse, [ {
				action: 'mousedown',
				button: button,
				position: this._lastMousePosition
			} ]).then(noop);
		}

		return this._post('buttondown', {
			button: button
		}).then(noop);
	}

	/**
	 * Releases a previously depressed mouse button.
	 *
	 * @param button The button to press. See [[Session.click]] for available options.
	 */
	releaseMouseButton(button?: number): Promise<void> {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute(simulateMouse, [ {
				action: 'mouseup',
				button: button,
				position: this._lastMousePosition
			} ]).then(noop);
		}

		return this._post('buttonup', {
			button: button
		}).then(noop);
	}

	/**
	 * Double-clicks the primary mouse button.
	 */
	doubleClick(): Promise<void> {
		if (this.capabilities.brokenMouseEvents) {
			return this.execute(simulateMouse, [ {
				action: 'dblclick',
				button: 0,
				position: this._lastMousePosition
			} ]).then(noop);
		}
		else if (this.capabilities.brokenDoubleClick) {
			return this.pressMouseButton().then(() => {
				return this.releaseMouseButton();
			}).then(() => {
				return this._post('doubleclick');
			});
		}

		return this._post('doubleclick').then(noop);
	}

	/**
	 * Taps an element on a touch screen device. If the element is outside of the viewport, the remote driver will
	 * attempt to scroll it into view automatically.
	 *
	 * @param element The element to tap.
	 */
	@forCommand({ usesElement: true })
	tap(element: Element): Promise<void> {
		// if (element) {
		// 	element = element.elementId;
		// }

		return this._post('touch/click', {
			element: element.elementId
		}).then(noop);
	}

	/**
	 * Depresses a new finger at the given point on a touch screen device without releasing it.
	 *
	 * @param x The screen x-coordinate to press, maybe in device pixels.
	 * @param y The screen y-coordinate to press, maybe in device pixels.
	 */
	pressFinger(x: number, y: number): Promise<void> {
		// TODO: If someone specifies the same coordinates as as an existing finger, will it switch the active finger
		// back to that finger instead of adding a new one?
		return this._post('touch/down', {
			x: x,
			y: y
		}).then(noop);
	}

	/**
	 * Releases whatever finger exists at the given point on a touch screen device.
	 *
	 * @param x The screen x-coordinate where a finger is pressed, maybe in device pixels.
	 * @param y The screen y-coordinate where a finger is pressed, maybe in device pixels.
	 */
	releaseFinger(x: number, y: number): Promise<void> {
		return this._post('touch/up', {
			x: x,
			y: y
		}).then(noop);
	}

	/**
	 * Moves the last depressed finger to a new point on the touch screen.
	 *
	 * @param x The screen x-coordinate to move to, maybe in device pixels.
	 * @param y The screen y-coordinate to move to, maybe in device pixels.
	 */
	moveFinger(x: number, y: number): Promise<void> {
		return this._post('touch/move', {
			x: x,
			y: y
		}).then(noop);
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
	touchScroll(xOffset: number, yOffset: number): Promise<void>;
	touchScroll(element?: Element, xOffset?: number, yOffset?: number): Promise<void>;
	@forCommand({ usesElement: true })
	touchScroll(...args: any[]): Promise<void> {
		let [ element, xOffset, yOffset ] = args;
		if (typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			yOffset = xOffset;
			xOffset = element;
			element = undefined;
		}

		if (this.capabilities.brokenTouchScroll) {
			return this.execute(/* istanbul ignore next */ function (element: HTMLElement, x: number, y: number) {
				const rect = { left: window.scrollX, top: window.scrollY };
				if (element) {
					const bbox = element.getBoundingClientRect();
					rect.left += bbox.left;
					rect.top += bbox.top;
				}

				window.scrollTo(rect.left + x, rect.top + y);
			}, [ element, xOffset, yOffset ]);
		}

		if (element) {
			element = element.elementId;
		}

		// TODO: If using this, please correct for device pixel ratio to ensure consistency
		return this._post('touch/scroll', {
			element: element,
			xoffset: xOffset,
			yoffset: yOffset
		}).then(noop);
	}

	/**
	 * Performs a double-tap gesture on an element.
	 *
	 * @param element The element to double-tap.
	 */
	@forCommand({ usesElement: true })
	doubleTap(element?: Element): Promise<void> {
		const elementId = element && element.elementId;

		return this._post('touch/doubleclick', {
			element: elementId
		}).then(noop);
	}

	/**
	 * Performs a long-tap gesture on an element.
	 *
	 * @param element The element to long-tap.
	 */
	@forCommand({ usesElement: true })
	longTap(element?: Element): Promise<void> {
		const elementId = element && element.elementId;
		return this._post('touch/longclick', {
			element: elementId
		}).then(noop);
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
	flickFinger(element: Element, xOffset: number, yOffset: number, speed?: number): Promise<void>;
	flickFinger(xOffset: number, yOffset: number, speed?: number): Promise<void>;
	@forCommand({ usesElement: true })
	flickFinger(...args: any[]): Promise<void> {
		let [ element, xOffset, yOffset, speed ] = args;
		if (typeof speed === 'undefined' && typeof yOffset === 'undefined' && typeof xOffset !== 'undefined') {
			return this._post('touch/flick', {
				xspeed: element,
				yspeed: xOffset
			}).then(noop);
		}

		// if (element) {
		// 	element = element.elementId;
		// }

		return this._post('touch/flick', {
			element: element.elementId,
			xoffset: xOffset,
			yoffset: yOffset,
			speed: speed
		}).then(noop);
	}

	/**
	 * Gets the current geographical location of the remote environment.
	 *
	 * @returns
	 * Latitude and longitude are specified using standard WGS84 decimal latitude/longitude. Altitude is specified
	 * as meters above the WGS84 ellipsoid. Not all environments support altitude.
	 */
	getGeolocation(): Promise<Geolocation> {
		return this._get('location').then(location => {
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
	setGeolocation(location: Geolocation): Promise<void> {
		// TODO: Is it weird that this accepts an object argument? `setCookie` does too, but nothing else does.
		if (location.altitude !== undefined) {
			this._lastAltitude = location.altitude;
		}

		return this._post('location', {
			location
		}).then(noop);
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
	getLogsFor(type: string): Promise<LogEntry[]> {
		return this._post('log', {
			type: type
		}).then(function (logs) {
			// At least Selendroid 0.9.0 returns logs as an array of strings instead of an array of log objects,
			// which is a spec violation; see https://github.com/selendroid/selendroid/issues/366
			if (logs && typeof logs[0] === 'string') {
				return logs.map(function (log: string) {
					const logData = /\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)/.exec(log);
					if (logData) {
						return {
							timestamp: Date.parse(logData[1]) / 1000,
							level: logData[2],
							message: logData[3]
						};
					}

					return {
						timestamp: NaN,
						level: 'INFO',
						message: log
					};
				});
			}

			return logs;
		});
	}

	/**
	 * Gets the types of logs that are currently available for retrieval from the remote environment.
	 */
	getAvailableLogTypes(): Promise<string[]> {
		if (this.capabilities.fixedLogTypes) {
			return Promise.resolve(this.capabilities.fixedLogTypes);
		}

		return this._get('log/types');
	}

	/**
	 * Gets the current state of the HTML5 application cache for the current page.
	 *
	 * @returns
	 * The cache status. One of 0 (uncached), 1 (cached/idle), 2 (checking), 3 (downloading), 4 (update ready), 5
	 * (obsolete).
	 */
	getApplicationCacheStatus(): Promise<number> {
		return this._get('application_cache/status');
	}

	/**
	 * Terminates the session. No more commands will be accepted by the remote after this point.
	 */
	quit(): Promise<void> {
		return this._server.deleteSession(this._sessionId).then(noop);
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
	private _manualFindByLinkText(using: string, value: string, multiple: boolean, element?: HTMLElement): HTMLElement|HTMLElement[] {
		const check = using === 'link text' ? function (linkText: string, text: string): boolean {
			return linkText === text;
		} : function (linkText: string, text: string): boolean {
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
	getLocalStorageKeys(): Promise<string[]> {
		return this._get('local_storage');
	}

	/**
	 * Sets a value in local storage for the focused window/frame.
	 *
	 * @param key The key to set.
	 * @param value The value to set.
	 */
	setLocalStorageItem(key: string, value: string): Promise<void> {
		return this._post('local_storage', { key, value });
	}

	/**
	 * Clears all data in local storage for the focused window/frame.
	 */
	clearLocalStorage(): Promise<void> {
		return this._delete('local_storage');
	}

	/**
	 * Gets a value from local storage for the focused window/frame.
	 *
	 * @param key The key of the data to get.
	 */
	getLocalStorageItem(key: string): Promise<string> {
		return this._get('local_storage/key/$0', null, [ key ]);
	}

	/**
	 * Deletes a value from local storage for the focused window/frame.
	 *
	 * @param key The key of the data to delete.
	 */
	deleteLocalStorageItem(key: string): Promise<void> {
		return this._get('local_storage/key/$0', null, [ key ]);
	}

	/**
	 * Gets the number of keys set in local storage for the focused window/frame.
	 */
	getLocalStorageLength(): Promise<number> {
		return this._get('local_storage/size');
	}

	/**
	 * Gets the list of keys set in session storage for the focused window/frame.
	 */
	getSessionStorageKeys(): Promise<string[]> {
		return this._get('session_storage');
	}

	/**
	 * Sets a value in session storage for the focused window/frame.
	 *
	 * @param key The key to set.
	 * @param value The value to set.
	 */
	setSessionStorageItem(key: string, value: string): Promise<void> {
		return this._post('session_storage', { key, value });
	}

	/**
	 * Clears all data in session storage for the focused window/frame.
	 */
	clearSessionStorage(): Promise<void> {
		return this._delete('session_storage');
	}

	/**
	 * Gets a value from session storage for the focused window/frame.
	 *
	 * @param key The key of the data to get.
	 */
	getSessionStorageItem(key: string): Promise<string> {
		return this._get('session_storage/key/$0', null, [ key ]);
	}

	/**
	 * Deletes a value from session storage for the focused window/frame.
	 *
	 * @param key The key of the data to delete.
	 */
	deleteSessionStorageItem(key: string): Promise<void> {
		return this._get('session_storage/key/$0', null, [ key ]);
	}

	/**
	 * Gets the number of keys set in session storage for the focused window/frame.
	 */
	getSessionStorageLength(): Promise<number> {
		return this._get('session_storage/size');
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
	findDisplayed(using: string, value: string): Promise<Element> { return null; }

	/**
	 * Waits for all elements in the currently active window/frame to be destroyed.
	 *
	 * @param using
	 * The element retrieval strategy to use. See [[Session.find]] for options.
	 *
	 * @param value
	 * The strategy-specific value to search for. See [[Session.find]] for details.
	 */
	waitForDeleted(strategy: string, value: string): Promise<void> { return null; }

	/**
	 * Gets the timeout for [[Session.executeAsync]] calls.
	 */
	getExecuteAsyncTimeout(): Promise<number> {
		return this.getTimeout('script');
	}

	/**
	 * Sets the timeout for [[Session.executeAsync]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setExecuteAsyncTimeout(ms: number): Promise<void> {
		return this.setTimeout('script', ms);
	}

	/**
	 * Gets the timeout for [[Session.find]] calls.
	 */
	getFindTimeout(): Promise<number> {
		return this.getTimeout('implicit');
	}

	/**
	 * Sets the timeout for [[Session.find]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setFindTimeout(ms: number): Promise<void> {
		return this.setTimeout('implicit', ms);
	}

	/**
	 * Gets the timeout for [[Session.get]] calls.
	 */
	getPageLoadTimeout(): Promise<number> {
		return this.getTimeout('page load');
	}

	/**
	 * Sets the timeout for [[Session.get]] calls.
	 *
	 * @param ms The length of the timeout, in milliseconds.
	 */
	setPageLoadTimeout(ms: number): Promise<void> {
		return this.setTimeout('page load', ms);
	}
}

util.applyMixins(Session, [ WaitForDeleted, FindDisplayed ]);
