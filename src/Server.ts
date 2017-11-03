import keys from './keys';

import Task from '@dojo/core/async/Task';
import request, { RequestOptions } from '@dojo/core/request';
import { Response as ResponseInterface } from '@dojo/core/request/interfaces';
import { NodeRequestOptions } from '@dojo/core/request/providers/node';
import Session from './Session';
import Element from './Element';
import statusCodes from './lib/statusCodes';
import { format, parse, resolve, Url } from 'url';
import { sleep, trimStack } from './lib/util';
import { create, mixin } from '@dojo/core/lang';
import { Capabilities, LeadfootURL, LeadfootError } from './interfaces';

export default class Server {
	url: string;

	requestOptions: RequestOptions;

	/**
	 * An alternative session constructor. Defaults to the standard [[Session]]
	 * constructor if one is not provided.
	 */
	sessionConstructor = Session;

	/**
	 * Whether or not to detect and/or correct environment capabilities when
	 * creating a new Server. If the value is "no-detect", capabilities will be
	 * updated with already-known features and defects based on the platform, but
	 * no tests will be run.
	 */
	fixSessionCapabilities: boolean | 'no-detect' = true;

	/**
	 * The Server class represents a remote HTTP server implementing the
	 * WebDriver wire protocol that can be used to generate new remote control
	 * sessions.
	 *
	 * @param url The fully qualified URL to the JsonWireProtocol endpoint on
	 * the server. The default endpoint for a JsonWireProtocol HTTP server is
	 * http://localhost:4444/wd/hub. You may also pass a parsed URL object
	 * which will be converted to a string.
	 * @param options Additional request options to be used for requests to the
	 * server.
	 */
	// TODO: NodeRequestOptions doesn't take a type in dojo-core alpha 20
	constructor(url: string | LeadfootURL, options?: NodeRequestOptions) {
		if (typeof url === 'object') {
			url = <URL>Object.create(url);
			if (url.username || url.password || url.accessKey) {
				url.auth =
					encodeURIComponent(url.username || '') +
					':' +
					encodeURIComponent(url.password || url.accessKey || '');
			}
		}

		this.url = format(<Url>url).replace(/\/*$/, '/');
		this.requestOptions = options || {};
	}

	/**
	 * A function that performs an HTTP request to a JsonWireProtocol endpoint
	 * and normalises response status and data.
	 *
	 * @param method The HTTP method to fix
	 *
	 * @param path The path-part of the JsonWireProtocol URL. May contain
	 * placeholders in the form `/\$\d/` that will be replaced by entries in
	 * the `pathParts` argument.
	 *
	 * @param requestData The payload for the request.
	 *
	 * @param pathParts Optional placeholder values to inject into the path of
	 * the URL.
	 */
	private _sendRequest<T>(
		method: string,
		path: string,
		requestData: any,
		pathParts?: string[]
	): Task<T> {
		const url =
			this.url +
			path.replace(/\$(\d)/, function(_, index) {
				return encodeURIComponent(pathParts![index]);
			});

		const defaultRequestHeaders: { [key: string]: string } = {
			// At least FirefoxDriver on Selenium 2.40.0 will throw a
			// NullPointerException when retrieving session capabilities if an
			// Accept header is not provided. (It is a good idea to provide one
			// anyway)
			Accept: 'application/json,text/plain;q=0.9'
		};

		const kwArgs = create(this.requestOptions, {
			followRedirects: false,
			handleAs: 'text',
			headers: { ...defaultRequestHeaders },
			method: method
		});

		if (requestData) {
			kwArgs.body = JSON.stringify(requestData);
			kwArgs.headers['Content-Type'] = 'application/json;charset=UTF-8';
			// At least ChromeDriver 2.9.248307 will not process request data
			// if the length of the data is not provided. (It is a good idea to
			// provide one anyway)
			kwArgs.headers['Content-Length'] = String(
				Buffer.byteLength(kwArgs.body, 'utf8')
			);
		} else {
			// At least Selenium 2.41.0 - 2.42.2 running as a grid hub will
			// throw an exception and drop the current session if a
			// Content-Length header is not provided with a DELETE or POST
			// request, regardless of whether the request actually contains any
			// request data.
			kwArgs.headers['Content-Length'] = '0';
		}

		const trace: any = {};
		Error.captureStackTrace(trace, this._sendRequest);

		return new Task<ResponseInterface>((resolve, reject) => {
			request(url, kwArgs)
				.then(resolve, reject)
				.finally(() => {
					const error = new Error('Canceled');
					error.name = 'CancelError';
					reject(error);
				});
		})
			.then(function handleResponse(
				response: ResponseInterface
			): ResponseData | Task<ResponseData> {
				// The JsonWireProtocol specification prior to June 2013 stated
				// that creating a new session should perform a 3xx redirect to
				// the session capabilities URL, instead of simply returning
				// the returning data about the session; as a result, we need
				// to follow all redirects to get consistent data
				if (
					response.status >= 300 &&
					response.status < 400 &&
					response.headers.get('Location')
				) {
					let redirectUrl = response.headers.get('Location')!;

					// If redirectUrl isn't an absolute URL, resolve it based
					// on the orignal URL used to create the session
					if (!/^\w+:/.test(redirectUrl)) {
						redirectUrl = resolve(url, redirectUrl);
					}

					return request(redirectUrl, {
						method: 'GET',
						headers: defaultRequestHeaders
					}).then(handleResponse);
				}

				return response.text().then(data => {
					return { response, data };
				});
			})
			.then((responseData: ResponseData): T | PromiseLike<T> => {
				const response = responseData.response;
				const responseType = response.headers.get('Content-Type');
				let data: any;

				if (
					responseType &&
					responseType.indexOf('application/json') === 0 &&
					responseData.data
				) {
					data = JSON.parse(responseData.data);
				}

				// Some drivers will respond to a DELETE request with 204; in
				// this case, we know the operation completed successfully, so
				// just create an expected response data structure for a
				// successful operation to avoid any special conditions
				// elsewhere in the code caused by different HTTP return values
				if (response.status === 204) {
					data = {
						status: 0,
						sessionId: null,
						value: null
					};
				} else if (
					response.status >= 400 ||
					(data && data.status > 0)
				) {
					const error: any = new Error();

					// "The client should interpret a 404 Not Found response
					// from the server as an "Unknown command" response. All
					// other 4xx and 5xx responses from the server that do not
					// define a status field should be interpreted as "Unknown
					// error" responses." -
					// http://code.google.com/p/selenium/wiki/JsonWireProtocol#Response_Status_Codes
					if (!data) {
						data = {
							status:
								response.status === 404 ||
								response.status === 501
									? 9
									: 13,
							value: {
								message: responseData.data
							}
						};
					} else if (!data.value && 'message' in data) {
						// ios-driver 0.6.6-SNAPSHOT April 2014 incorrectly
						// implements the specification: does not return error
						// data on the `value` key, and does not return the
						// correct HTTP status for unknown commands
						data = {
							status:
								response.status === 404 ||
								response.status === 501 ||
								data.message.indexOf('cannot find command') > -1
									? 9
									: 13,
							value: data
						};
					}

					// At least Appium April 2014 responds with the HTTP status
					// Not Implemented but a Selenium status UnknownError for
					// commands that are not implemented; these errors are more
					// properly represented to end-users using the Selenium
					// status UnknownCommand, so we make the appropriate
					// coercion here
					if (response.status === 501 && data.status === 13) {
						data.status = 9;
					}

					// At least BrowserStack in May 2016 responds with HTTP 500
					// and a message value of "Invalid Command" for at least
					// some unknown commands. These errors are more properly
					// represented to end-users using the Selenium status
					// UnknownCommand, so we make the appropriate coercion here
					if (
						response.status === 500 &&
						data.value &&
						data.value.message === 'Invalid Command'
					) {
						data.status = 9;
					}

					// At least FirefoxDriver 2.40.0 responds with HTTP status
					// codes other than Not Implemented and a Selenium status
					// UnknownError for commands that are not implemented;
					// however, it provides a reliable indicator that the
					// operation was unsupported by the type of the exception
					// that was thrown, so also coerce this back into an
					// UnknownCommand response for end-user code
					if (
						data.status === 13 &&
						data.value &&
						data.value.class &&
						(data.value.class.indexOf(
							'UnsupportedOperationException'
						) > -1 ||
							data.value.class.indexOf(
								'UnsupportedCommandException'
							) > -1)
					) {
						data.status = 9;
					}

					// At least InternetExplorerDriver 2.41.0 & SafariDriver
					// 2.41.0 respond with HTTP status codes other than Not
					// Implemented and a Selenium status UnknownError for
					// commands that are not implemented; like FirefoxDriver
					// they provide a reliable indicator of unsupported
					// commands
					if (
						response.status === 500 &&
						data.value &&
						data.value.message &&
						(data.value.message.indexOf('Command not found') > -1 ||
							data.value.message.indexOf('Unknown command') > -1)
					) {
						data.status = 9;
					}

					// At least GhostDriver 1.1.0 incorrectly responds with
					// HTTP 405 instead of HTTP 501 for unimplemented commands
					if (
						response.status === 405 &&
						data.value &&
						data.value.message &&
						data.value.message.indexOf('Invalid Command Method') >
							-1
					) {
						data.status = 9;
					}

					const statusCode =
						statusCodes[<keyof typeof statusCodes>data.status];
					if (statusCode) {
						const [name, message] = statusCode;
						if (name && message) {
							error.name = name;
							error.message = message;
						}
					}

					if (data.value && data.value.message) {
						error.message = data.value.message;
					}

					if (data.value && data.value.screen) {
						data.value.screen = new Buffer(
							data.value.screen,
							'base64'
						);
					}

					error.status = data.status;
					error.detail = data.value;
					error.request = {
						url: url,
						method: method,
						data: requestData
					};
					error.response = response;

					const sanitizedUrl = (function() {
						const parsedUrl = parse(url);
						if (parsedUrl.auth) {
							parsedUrl.auth = '(redacted)';
						}

						return format(parsedUrl);
					})();

					error.message =
						'[' +
						method +
						' ' +
						sanitizedUrl +
						(requestData
							? ' / ' + JSON.stringify(requestData)
							: '') +
						'] ' +
						error.message;
					error.stack = error.message + trimStack(trace.stack);

					throw error;
				}

				return data;
			})
			.catch(function(error: Error) {
				error.stack = error.message + trimStack(trace.stack);
				throw error;
			});
	}

	get<T>(path: string, requestData?: Object, pathParts?: string[]): Task<T> {
		return this._sendRequest<T>('GET', path, requestData, pathParts);
	}

	post<T>(path: string, requestData?: Object, pathParts?: string[]): Task<T> {
		return this._sendRequest<T>('POST', path, requestData, pathParts);
	}

	delete<T>(
		path: string,
		requestData?: Object,
		pathParts?: string[]
	): Task<T> {
		return this._sendRequest<T>('DELETE', path, requestData, pathParts);
	}

	/**
	 * Gets the status of the remote server.
	 *
	 * @returns An object containing arbitrary properties describing the status
	 * of the remote server.
	 */
	getStatus() {
		return this.get('status').then(returnValue);
	}

	/**
	 * Creates a new remote control session on the remote server.
	 *
	 * @param desiredCapabilities A hash map of desired capabilities of the
	 * remote environment. The server may return an environment that does not
	 * match all the desired capabilities if one is not available.
	 *
	 * @param requiredCapabilities A hash map of required capabilities of the
	 * remote environment. The server will not return an environment that does
	 * not match all the required capabilities if one is not available.
	 */
	createSession<S extends Session = Session>(
		desiredCapabilities: Capabilities,
		requiredCapabilities?: Capabilities
	): Task<S> {
		let fixSessionCapabilities = this.fixSessionCapabilities;
		if (desiredCapabilities.fixSessionCapabilities != null) {
			fixSessionCapabilities = desiredCapabilities.fixSessionCapabilities;

			// Don’t send `fixSessionCapabilities` to the server
			desiredCapabilities = { ...desiredCapabilities };
			desiredCapabilities.fixSessionCapabilities = undefined;
		}

		return this.post<any>('session', {
			desiredCapabilities,
			requiredCapabilities
		}).then(response => {
			// At least geckodriver 0.15.0 returns the response data in a
			// 'value' property, whereas Selenium does not.
			if (response.value && response.value.sessionId) {
				response = response.value;
			}

			const session = new this.sessionConstructor(
				response.sessionId,
				this,
				response.value
			);

			if (fixSessionCapabilities) {
				return this._fillCapabilities(
					<S>session,
					fixSessionCapabilities !== 'no-detect'
				)
					.catch(error =>
						// The session was started on the server, but we did
						// not resolve the Task yet. If a failure occurs during
						// capabilities filling, we should quit the session on
						// the server too since the caller will not be aware
						// that it ever got that far and will have no access to
						// the session to quit itself.
						session.quit().finally(() => {
							throw error;
						})
					)
					.then(() => <S>session);
			} else {
				return <S>session;
			}
		});
	}

	/**
	 * Fill in known capabilities/defects and optionally run tests to detect
	 * more
	 */
	private _fillCapabilities<S extends Session>(
		session: S,
		detectCapabilities = true
	): Task<S> {
		mixin(session.capabilities, this._getKnownCapabilities(session));
		return (detectCapabilities
			? this._detectCapabilities(session)
			: Task.resolve(session)
		).then(() => {
			Object.defineProperty(session.capabilities, '_filled', {
				value: true,
				configurable: true
			});
			return session;
		});
	}

	/**
	 * Return capabilities and defects that don't require running tests
	 */
	private _getKnownCapabilities(session: Session) {
		const capabilities = session.capabilities;
		const updates: Capabilities = {};

		// At least geckodriver 0.15.0 only returns platformName (not platform)
		// and browserVersion (not version) in its capabilities.
		if (capabilities.platform && !capabilities.platformName) {
			capabilities.platformName = capabilities.platform;
		}
		if (capabilities.version && !capabilities.browserVersion) {
			capabilities.browserVersion = capabilities.version;
		}

		// At least SafariDriver 2.41.0 fails to allow stand-alone feature
		// testing because it does not inject user scripts for URLs that are
		// not http/https
		if (isSafari(capabilities) && isMac(capabilities)) {
			mixin(updates, {
				nativeEvents: false,
				rotatable: false,
				locationContextEnabled: false,
				webStorageEnabled: false,
				applicationCacheEnabled: false,
				supportsNavigationDataUris: true,
				supportsCssTransforms: true,
				supportsExecuteAsync: true,
				mouseEnabled: true,
				touchEnabled: false,
				dynamicViewport: true,
				shortcutKey: keys.COMMAND,

				// This must be set; running it as a server test will cause
				// SafariDriver to emit errors with the text "undefined is not
				// an object (evaluating 'a.postMessage')", and the session
				// will become unresponsive
				returnsFromClickImmediately: false,

				brokenDeleteCookie: false,
				brokenExecuteElementReturn: false,
				brokenExecuteUndefinedReturn: false,
				brokenElementDisplayedOpacity: false,
				brokenElementDisplayedOffscreen: false,
				brokenSubmitElement: true,
				brokenWindowSwitch: true,
				brokenDoubleClick: false,
				brokenCssTransformedSize: true,
				fixedLogTypes: false as false,
				brokenHtmlTagName: false,
				brokenNullGetSpecAttribute: false
			});

			// SafariDriver, which shows versions up to 10.x, doesn't support
			// file uploads
			if (isValidVersion(capabilities, 0, 100)) {
				mixin(updates, {
					remoteFiles: false,

					brokenActiveElement: true,
					brokenExecuteForNonHttpUrl: true,
					brokenMouseEvents: true,
					brokenNavigation: true,
					brokenOptionSelect: false,
					brokenSendKeys: true,
					brokenWindowPosition: true,
					brokenWindowSize: true,

					// SafariDriver 2.41.0 cannot delete cookies, at all, ever
					brokenCookies: true
				});

				if (isValidVersion(capabilities, 10, 11)) {
					mixin(updates, {
						// Safari 10 using SafariDriver does not appear to
						// support executeAsync at least as of May 2017
						supportsExecuteAsync: false
					});
				}
			}

			// The native safaridriver reports versions like '12603.1.30.0.34'
			if (isValidVersion(capabilities, 1000)) {
				mixin(updates, {
					brokenLinkTextLocator: true,
					brokenOptionSelect: true,
					brokenWhitespaceNormalization: true,
					fixedLogTypes: [],
					usesWebDriverActiveElement: true
				});
			}

			return updates;
		}

		// The window sizing commands in the W3C standard don't use window
		// handles, but they do under the JsonWireProtocol. By default, Session
		// assumes handles are used. When the result of this check is added to
		// capabilities, Session will take it into account.
		if (isFirefox(capabilities, 53, Infinity)) {
			updates.usesWebDriverWindowCommands = true;
		}

		if (isMsEdge(capabilities)) {
			// At least MS Edge 14316 returns immediately from a click request
			// immediately rather than waiting for default action to occur.
			updates.returnsFromClickImmediately = true;

			// MS Edge has broken cookie deletion.
			updates.brokenDeleteCookie = true;

			// At least MS Edge may return an 'element is obscured' error when
			// trying to click on visible elements.
			updates.brokenClick = true;

			// File uploads don't work on Edge as of May 2017
			updates.remoteFiles = false;
		}

		// At least MS Edge 10586 becomes unresponsive after calling DELETE
		// window, and window.close() requires user interaction. This
		// capability is distinct from brokenDeleteWindow as this capability
		// indicates that there is no way to close a Window.
		if (isMsEdge(capabilities, 25.10586)) {
			updates.brokenWindowClose = true;
		}

		// At least MS Edge Driver 14316 doesn't support sending keys to a file
		// input. See
		// https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/7194303/
		//
		// The existing feature test for this caused some browsers to hang, so
		// just flag it for Edge for now.
		if (isMsEdge(capabilities, 38.14366)) {
			updates.brokenFileSendKeys = true;
		}

		// At least MS Edge 14316 supports alerts but does not specify the
		// capability
		if (
			isMsEdge(capabilities, 37.14316) &&
			!('handlesAlerts' in capabilities)
		) {
			updates.handlesAlerts = true;
		}

		if (isFirefox(capabilities, 49, Infinity)) {
			// The W3C WebDriver standard does not support the session-level
			// /keys command, but JsonWireProtocol does.
			updates.supportsKeysCommand = false;

			// Firefox 49+ (via geckodriver) only supports W3C locator
			// strategies
			updates.usesWebDriverLocators = true;

			// Firefox 49+ (via geckodriver) requires keys sent to an element
			// to be a flat array
			updates.usesFlatKeysArray = true;

			// At least Firefox 49 + geckodriver can't POST empty data
			updates.brokenEmptyPost = true;

			// At least geckodriver 0.11 and Firefox 49 don't implement mouse
			// control, so everything will need to be simulated.
			updates.brokenMouseEvents = true;

			// Firefox 49+ (via geckodriver) doesn't support retrieving logs or
			// log types, and may hang the session.
			updates.fixedLogTypes = [];
		}

		if (isFirefox(capabilities, 49, 53)) {
			// At least geckodriver 0.15.0 and Firefox 51 will stop responding
			// to commands when performing window switches.
			updates.brokenWindowSwitch = true;
		}

		if (isInternetExplorer(capabilities, 11)) {
			// IE11 will take screenshots, but it's very slow
			updates.takesScreenshot = true;

			// IE11 will hang during this check if nativeEvents are enabled
			updates.brokenSubmitElement = true;
		}

		if (isInternetExplorer(capabilities, 11, Infinity)) {
			// At least IE11 will hang during this check, although option
			// selection does work with it
			updates.brokenOptionSelect = false;
		}

		// Using mouse services such as doubleclick will hang Firefox 49+
		// session on the Mac.
		if (
			!('mouseEnabled' in capabilities) &&
			isFirefox(capabilities, 49, Infinity) &&
			isMac(capabilities)
		) {
			updates.mouseEnabled = true;
		}

		// Don't check for touch support if the environment reports that no
		// touchscreen is available
		if (capabilities.hasTouchScreen === false) {
			updates.touchEnabled = false;
		}

		// Don't check for touch support if the environment reports that no
		// touchscreen is available. Also, ChromeDriver
		// 2.19 claims that it supports touch but it does not implement all of
		//   the touch endpoints from JsonWireProtocol
		if (
			capabilities.hasTouchScreen === false ||
			capabilities.browserName === 'chrome'
		) {
			updates.touchEnabled = false;
		}

		// It is not possible to test this since the feature tests runs in
		// quirks-mode on IE<10, but we know that IE9 supports CSS transforms
		if (isInternetExplorer(capabilities, 9)) {
			updates.supportsCssTransforms = true;
		}

		updates.shortcutKey = (function() {
			const platform = (capabilities.platform ||
				capabilities.platformName)!;

			if (/^mac/i.test(platform) || /^darwin/i.test(platform)) {
				return keys.COMMAND;
			}

			if (/^ios/i.test(platform)) {
				return null;
			}

			return keys.CONTROL;
		})();

		// Internet Explorer 8 and earlier will simply crash the server if we
		// attempt to return the parent frame via script, so never even attempt
		// to do so
		updates.scriptedParentFrameCrashesBrowser = isInternetExplorer(
			capabilities,
			0,
			9
		);

		if (
			// At least ios-driver 0.6.6-SNAPSHOT April 2014 corrupts its
			// internal state when performing window switches and gets
			// permanently stuck; we cannot feature detect, so platform
			// sniffing it is
			capabilities.browserName === 'Safari' &&
			capabilities.platformName === 'IOS'
		) {
			updates.brokenWindowSwitch = true;
		}

		// At least selendroid 0.12.0-SNAPSHOT doesn't support switching to the
		// parent frame
		if (
			capabilities.browserName === 'android' &&
			capabilities.deviceName === 'Android Emulator'
		) {
			updates.brokenParentFrameSwitch = true;
		}

		return updates;
	}

	/**
	 * Run tests to detect capabilities/defects
	 */
	private _detectCapabilities(session: Session): Task<void | Session> {
		const capabilities = session.capabilities;
		const supported = () => true;
		const unsupported = () => false;
		const maybeSupported = (error: Error) => {
			if (error.name === 'UnknownCommand') {
				return false;
			}
			if (/\bunimplemented command\b/.test(error.message)) {
				return false;
			}
			return true;
		};
		const broken = supported;
		const works = unsupported;

		/**
		 * Adds the capabilities listed in the `testedCapabilities` object to
		 * the hash of capabilities for the current session. If a tested
		 * capability value is a function, it is assumed that it still needs to
		 * be executed serially in order to resolve the correct value of that
		 * particular capability.
		 */
		const addCapabilities = (
			testedCapabilities: Capabilities
		): Task<void> => {
			return Object.keys(
				testedCapabilities
			).reduce((previous: Task<void>, key: keyof Capabilities) => {
				return previous.then(() => {
					const value = testedCapabilities[key];
					const task =
						typeof value === 'function'
							? value()
							: Task.resolve(value);
					return task.then((value: any) => {
						capabilities[key] = value;
					});
				});
			}, Task.resolve());
		};

		const get = (page: string) => {
			if (capabilities.supportsNavigationDataUris !== false) {
				return session.get(
					'data:text/html;charset=utf-8,' + encodeURIComponent(page)
				);
			}

			// Internet Explorer 9 and earlier, and Microsoft Edge build 10240
			// and earlier, hang when attempting to do navigate after a
			// `document.write` is performed to reset the tab content; we can
			// still do some limited testing in these browsers by using the
			// initial browser URL page and injecting some content through
			// innerHTML, though it is unfortunately a quirks-mode file so
			// testing is limited
			if (
				isInternetExplorer(capabilities, 0, 10) ||
				isMsEdge(capabilities)
			) {
				// Edge driver doesn't provide an initialBrowserUrl
				let initialUrl = 'about:blank';

				// As of version 3.3.0.1, IEDriverServer provides IE-specific
				// options, including the initialBrowserUrl, under an
				// 'se:ieOptions' property rather than directly on
				// capabilities.
				// https://github.com/SeleniumHQ/selenium/blob/e60b607a97b9b7588d59e0c26ef9a6d1d1350911/cpp/iedriverserver/CHANGELOG
				if (
					isInternetExplorer(capabilities) &&
					capabilities['se:ieOptions']
				) {
					initialUrl = capabilities['se:ieOptions'].initialBrowserUrl;
				} else if (capabilities.initialBrowserUrl) {
					initialUrl = capabilities.initialBrowserUrl;
				}

				return session.get(initialUrl).then(function() {
					return session.execute<
						void
					>('document.body.innerHTML = arguments[0];', [
						// The DOCTYPE does not apply, for obvious reasons, but
						// also old IE will discard invisible elements like
						// `<script>` and `<style>` if they are the first
						// elements injected with `innerHTML`, so an extra text
						// node is added before the rest of the content instead
						page.replace('<!DOCTYPE html>', 'x')
					]);
				});
			}

			return session.get('about:blank').then(function() {
				return session.execute<void>('document.write(arguments[0]);', [
					page
				]);
			});
		};

		const discoverServerFeatures = () => {
			const testedCapabilities: any = {};

			// Check that the remote server will accept file uploads. There is
			// a secondary test in discoverDefects that checks whether the
			// server allows typing into file inputs.
			if (capabilities.remoteFiles == null) {
				testedCapabilities.remoteFiles = function() {
					// TODO: _post probably shouldn't be private
					return session
						.serverPost<string>('file', {
							file:
								'UEsDBAoAAAAAAD0etkYAAAAAAAAAAAAAAAAIABwAdGVzdC50eHRVVAkAA2WnXlVlp15VdXgLAAEE8gMAAATyAwAAUEsBAh4DCgAAAAAAPR62RgAAAAAAAAAAAAAAAAgAGAAAAAAAAAAAAKSBAAAAAHRlc3QudHh0VVQFAANlp15VdXgLAAEE8gMAAATyAwAAUEsFBgAAAAABAAEATgAAAEIAAAAAAA=='
						})
						.then(function(filename) {
							return (
								filename && filename.indexOf('test.txt') > -1
							);
						})
						.catch(unsupported);
				};
			}

			if (capabilities.supportsSessionCommand == null) {
				testedCapabilities.supportsSessionCommands = this.get(
					'session/$0',
					undefined,
					[session.sessionId]
				).then(supported, unsupported);
			}

			if (capabilities.usesWebDriverTimeouts == null) {
				testedCapabilities.usesWebDriverTimeouts = session
					.setFindTimeout(500)
					.then(unsupported, error =>
						/Missing 'type' parameter/.test(error.message)
					);
			}

			if (capabilities.usesWebDriverWindowCommands == null) {
				testedCapabilities.usesWebDriverWindowCommands = session
					.serverGet('window/rect')
					.then(supported, unsupported);
			}

			// The W3C standard says window commands should take a 'handle'
			// parameter, while the JsonWireProtocol used a 'name' parameter.
			if (capabilities.usesHandleParameter == null) {
				testedCapabilities.usesHandleParameter = session
					.switchToWindow('current')
					.then(unsupported, error =>
						/Missing .*handle/.test(error.message)
					);
			}

			// Sauce Labs will not return a list of sessions at least as of May
			// 2017
			if (capabilities.brokenSessionList == null) {
				testedCapabilities.brokenSessionList = this.getSessions().then(
					works,
					broken
				);
			}

			if (capabilities.usesWebDriverFrameId == null) {
				testedCapabilities.usesWebDriverFrameId = session
					.switchToFrame('inlineFrame')
					.then(unsupported, error =>
						/frame id has unexpected type/.test(error.message)
					);
			}

			if (capabilities.returnsFromClickImmediately == null) {
				testedCapabilities.returnsFromClickImmediately = function() {
					function assertSelected(expected: any) {
						return function(actual: any) {
							if (expected !== actual) {
								throw new Error('unexpected selection state');
							}
						};
					}

					return get('<!DOCTYPE html><input type="checkbox" id="c">')
						.then(function() {
							return session.findById('c');
						})
						.then(function(element) {
							return element
								.click()
								.then(function() {
									return element.isSelected();
								})
								.then(assertSelected(true))
								.then(function() {
									return element.click().then(function() {
										return element.isSelected();
									});
								})
								.then(assertSelected(false))
								.then(function() {
									return element.click().then(function() {
										return element.isSelected();
									});
								})
								.then(assertSelected(true));
						})
						.then(works, broken);
				};
			}

			// The W3C WebDriver standard does not support the session-level
			// /keys command, but JsonWireProtocol does.
			if (capabilities.supportsKeysCommand == null) {
				testedCapabilities.supportsKeysCommand = session
					.serverPost('keys', { value: ['a'] })
					.then(supported, unsupported);
			}

			return Task.all(
				Object.keys(testedCapabilities).map(
					key => testedCapabilities[key]
				)
			).then(() => testedCapabilities);
		};

		const discoverFeatures = () => {
			const testedCapabilities: any = {};

			// At least SafariDriver 2.41.0 fails to allow stand-alone feature
			// testing because it does not inject user scripts for URLs that
			// are not http/https
			if (isSafari(capabilities) && isMac(capabilities)) {
				return Task.resolve({});
			}

			// Appium iOS as of April 2014 supports rotation but does not
			// specify the capability
			if (capabilities.rotatable == null) {
				testedCapabilities.rotatable = session
					.getOrientation()
					.then(supported, unsupported);
			}

			if (capabilities.locationContextEnabled) {
				testedCapabilities.locationContextEnabled = session
					.getGeolocation()
					.then(supported, function(error) {
						// At least FirefoxDriver 2.40.0 and ios-driver 0.6.0
						// claim they support geolocation in their returned
						// capabilities map, when they do not
						if (
							error.message.indexOf(
								'not mapped : GET_LOCATION'
							) !== -1
						) {
							return false;
						}

						// At least chromedriver 2.25 requires the location to
						// be set first. At least chromedriver 2.25 will throw
						// a CastClassException while trying to retrieve a
						// geolocation.
						if (
							error.message.indexOf('Location must be set') !== -1
						) {
							return session
								.setGeolocation({
									latitude: 12.1,
									longitude: -22.33,
									altitude: 1000.2
								})
								.then(() => session.getGeolocation())
								.then(supported, unsupported);
						}

						return false;
					});
			}

			// At least FirefoxDriver 2.40.0 claims it supports web storage in
			// the returned capabilities map, when it does not
			if (capabilities.webStorageEnabled) {
				testedCapabilities.webStorageEnabled = session
					.getLocalStorageLength()
					.then(supported, maybeSupported);
			}

			// At least FirefoxDriver 2.40.0 claims it supports application
			// cache in the returned capabilities map, when it does not
			if (capabilities.applicationCacheEnabled) {
				testedCapabilities.applicationCacheEnabled = session
					.getApplicationCacheStatus()
					.then(supported, maybeSupported);
			}

			if (capabilities.takesScreenshot == null) {
				// At least Selendroid 0.9.0 will fail to take screenshots in
				// certain device configurations, usually emulators with
				// hardware acceleration enabled
				testedCapabilities.takesScreenshot = session
					.takeScreenshot()
					.then(supported, unsupported);
			}

			// At least ios-driver 0.6.6-SNAPSHOT April 2014 does not support
			// execute_async
			if (capabilities.supportsExecuteAsync == null) {
				testedCapabilities.supportsExecuteAsync = session
					.executeAsync('arguments[0](true);')
					.catch(unsupported);
			}

			// Using mouse services such as doubleclick will hang Firefox 49+
			// session on the Mac.
			if (
				capabilities.mouseEnabled == null &&
				!(isFirefox(capabilities, 49, Infinity) && isMac(capabilities))
			) {
				testedCapabilities.mouseEnabled = function() {
					return session
						.doubleClick()
						.then(supported, maybeSupported);
				};
			}

			if (capabilities.touchEnabled == null) {
				testedCapabilities.touchEnabled = function() {
					return get(
						'<!DOCTYPE html><button id="clicker">Click me</button>'
					)
						.then(function() {
							return session.findById('clicker');
						})
						.then(function(button) {
							return session
								.doubleTap(button)
								.then(supported, maybeSupported);
						})
						.catch(unsupported);
				};
			}

			if (capabilities.dynamicViewport == null) {
				testedCapabilities.dynamicViewport = session
					.getWindowSize()
					.then(function(originalSize) {
						// At least Firefox 53 will hang if the target size is
						// the same as the current size
						return session.setWindowSize(
							originalSize.width - 2,
							originalSize.height - 2
						);
					})
					.then(supported, unsupported);
			}

			// At least Internet Explorer 11 and earlier do not allow data URIs
			// to be used for navigation
			if (capabilities.supportsNavigationDataUris == null) {
				testedCapabilities.supportsNavigationDataUris = function() {
					return get('<!DOCTYPE html><title>a</title>')
						.then(function() {
							return session.getPageTitle();
						})
						.then(function(pageTitle) {
							return pageTitle === 'a';
						})
						.catch(unsupported);
				};
			}

			if (capabilities.supportsCssTransforms == null) {
				testedCapabilities.supportsCssTransforms = function() {
					return get(
						'<!DOCTYPE html><style>#a{width:8px;height:8px;-ms-transform:scale(0.5);-moz-transform:scale(0.5);-webkit-transform:scale(0.5);transform:scale(0.5);}</style><div id="a"></div>'
					)
						.then(function() {
							return session.execute(
								/* istanbul ignore next */ function() {
									const bbox = document.getElementById(
										'a'
									)!.getBoundingClientRect();
									return bbox.right - bbox.left === 4;
								}
							);
						})
						.catch(unsupported);
				};
			}

			return Task.all(
				Object.keys(testedCapabilities).map(
					key => testedCapabilities[key]
				)
			).then(() => testedCapabilities);
		};

		const discoverDefects = (): Task<Capabilities> => {
			const testedCapabilities: any = {};

			// At least SafariDriver 2.41.0 fails to allow stand-alone feature
			// testing because it does not inject user scripts for URLs that
			// are not http/https
			if (isSafari(capabilities) && isMac(capabilities)) {
				return Task.resolve({});
			}

			// At least ChromeDriver 2.9 and MS Edge 10240 does not implement
			// /element/active
			if (capabilities.brokenActiveElement == null) {
				testedCapabilities.brokenActiveElement = session
					.getActiveElement()
					.then(works, function(error) {
						return error.name === 'UnknownCommand';
					});
			}

			// At least Selendroid 0.9.0 has broken cookie deletion.
			if (
				capabilities.brokenDeleteCookie == null &&
				capabilities.browserName === 'selendroid'
			) {
				// This test is very hard to get working properly in other
				// environments so only test when Selendroid is the browser
				testedCapabilities.brokenDeleteCookie = function() {
					return session
						.get('about:blank')
						.then(function() {
							return session.clearCookies();
						})
						.then(function() {
							return session.setCookie({
								name: 'foo',
								value: 'foo'
							});
						})
						.then(function() {
							return session.deleteCookie('foo');
						})
						.then(function() {
							return session.getCookies();
						})
						.then(function(cookies) {
							return cookies.length > 0;
						})
						.catch(function() {
							return true;
						})
						.then(function(isBroken) {
							return session
								.clearCookies()
								.then(() => isBroken, () => isBroken);
						});
				};
			}

			// At least Selendroid 0.9.0 incorrectly returns HTML tag names in
			// uppercase, which is a violation of the JsonWireProtocol spec
			if (capabilities.brokenHtmlTagName == null) {
				testedCapabilities.brokenHtmlTagName = session
					.findByTagName('html')
					.then(function(element) {
						return element.getTagName();
					})
					.then(function(tagName) {
						return tagName !== 'html';
					})
					.catch(broken);
			}

			// At least ios-driver 0.6.6-SNAPSHOT incorrectly returns empty
			// string instead of null for attributes that do not exist
			if (capabilities.brokenNullGetSpecAttribute == null) {
				testedCapabilities.brokenNullGetSpecAttribute = session
					.findByTagName('html')
					.then(function(element) {
						return element.getSpecAttribute('nonexisting');
					})
					.then(function(value) {
						return value !== null;
					})
					.catch(broken);
			}

			// At least MS Edge 10240 doesn't properly deserialize web elements
			// passed as `execute` arguments
			if (capabilities.brokenElementSerialization == null) {
				testedCapabilities.brokenElementSerialization = function() {
					return get('<!DOCTYPE html><div id="a"></div>')
						.then(function() {
							return session.findById('a');
						})
						.then(function(element) {
							return session.execute(
								function(element: Element) {
									return element.getAttribute('id');
								},
								[element]
							);
						})
						.then(function(attribute) {
							return attribute !== 'a';
						})
						.catch(broken);
				};
			}

			// At least Selendroid 0.16.0 incorrectly returns `undefined`
			// instead of `null` when an undefined value is returned by an
			// `execute` call
			if (capabilities.brokenExecuteUndefinedReturn == null) {
				testedCapabilities.brokenExecuteUndefinedReturn = session
					.execute('return undefined;')
					.then(function(value) {
						return value !== null;
					}, broken);
			}

			// At least Selendroid 0.9.0 always returns invalid element handles
			// from JavaScript
			if (capabilities.brokenExecuteElementReturn == null) {
				testedCapabilities.brokenExecuteElementReturn = function() {
					return get('<!DOCTYPE html><div id="a"></div>')
						.then(function() {
							return session.execute<Element>(
								'return document.getElementById("a");'
							);
						})
						.then(element => element && element.getTagName())
						.then(works, broken);
				};
			}

			// At least Selendroid 0.9.0 treats fully transparent elements as
			// displayed, but all others do not
			if (capabilities.brokenElementDisplayedOpacity == null) {
				testedCapabilities.brokenElementDisplayedOpacity = function() {
					return get(
						'<!DOCTYPE html><div id="a" style="opacity: .1;">a</div>'
					)
						.then(function() {
							// IE<9 do not support CSS opacity so should not be
							// involved in this test
							return session.execute(
								'var o = document.getElementById("a").style.opacity; return o && o.charAt(0) === "0";'
							);
						})
						.then(function(supportsOpacity) {
							if (!supportsOpacity) {
								return works();
							} else {
								return session
									.execute(
										'document.getElementById("a").style.opacity = "0";'
									)
									.then(function() {
										return session.findById('a');
									})
									.then(function(element) {
										return element.isDisplayed();
									});
							}
						})
						.catch(broken);
				};
			}

			// At least ChromeDriver 2.9 treats elements that are offscreen as
			// displayed, but others do not
			if (capabilities.brokenElementDisplayedOffscreen == null) {
				testedCapabilities.brokenElementDisplayedOffscreen = function() {
					const pageText =
						'<!DOCTYPE html><div id="a" style="left: 0; position: absolute; top: -1000px;">a</div>';
					return get(pageText)
						.then(function() {
							return session.findById('a');
						})
						.then(function(element) {
							return element.isDisplayed();
						})
						.catch(broken);
				};
			}

			// The feature test for this causes some browsers to hang, so it's
			// just flagged directly for Edge for now.
			// testedCapabilities.brokenFileSendKeys = function () {
			// 	return get('<!DOCTYPE html><input type="file" id="i1">').then(function () {
			// 		var element;
			// 		return session.findById('i1')
			// 			.then(function (element) {
			// 				return element.type('./Server.js');
			// 			}).then(function () {
			// 				return session.execute(function () {
			// 					return document.getElementById('i1').value;
			// 				});
			// 			}).then(function (text) {
			// 				if (!/Server.js$/.test(text)) {
			// 					throw new Error('mismatch');
			// 				}
			// 			});
			// 	}).then(works, broken);
			// };

			// At least MS Edge Driver 14316 doesn't normalize whitespace
			// properly when retrieving text. Text may contain "\r\n" pairs
			// rather than "\n", and there may be extraneous whitespace
			// adjacent to "\r\n" pairs and at the start and end of the text.
			if (capabilities.brokenWhitespaceNormalization == null) {
				testedCapabilities.brokenWhitespaceNormalization = function() {
					return get(
						'<!DOCTYPE html><div id="d">This is\n<br>a test\n</div>'
					)
						.then(function() {
							return session
								.findById('d')
								.then(function(element) {
									return element.getVisibleText();
								})
								.then(function(text) {
									if (
										/\r\n/.test(text) ||
										/\s+$/.test(text)
									) {
										throw new Error('invalid whitespace');
									}
								});
						})
						.then(works, broken);
				};
			}

			// At least geckodriver 0.15.0 and Firefox 51.0.1 don't properly
			// normalize link text when using the 'link text' locator strategy.
			if (capabilities.brokenLinkTextLocator == null) {
				testedCapabilities.brokenLinkTextLocator = function() {
					return get(
						'<!DOCTYPE html><a id="d">What a cute<span style="display:none">, yellow</span> backpack</a><a id="e">What a cute, yellow backpack</a>'
					)
						.then(function() {
							return session
								.findByLinkText('What a cute, yellow backpack')
								.then(function(element) {
									return element.getVisibleText();
								})
								.then(function(text) {
									if (
										text !== 'What a cute, yellow backpack'
									) {
										throw new Error(
											'incorrect link was found'
										);
									}
								});
						})
						.then(works, broken);
				};
			}

			// At least MS Edge Driver 14316 doesn't return elements' computed
			// styles
			if (capabilities.brokenComputedStyles == null) {
				testedCapabilities.brokenComputedStyles = function() {
					const pageText =
						'<!DOCTYPE html><style>a { background: purple }</style><a id="a1">foo</a>';
					return get(pageText)
						.then(function() {
							return session.findById('a1');
						})
						.then(function(element) {
							return element.getComputedStyle('background-color');
						})
						.then(function(value) {
							if (!value) {
								throw new Error('empty style');
							}
						})
						.then(works, broken);
				};
			}

			if (capabilities.brokenOptionSelect == null) {
				if (capabilities.brokenOptionSelect == null) {
					// At least MS Edge Driver 14316 doesn't allow selection
					// option elements to be clicked.
					testedCapabilities.brokenOptionSelect = function() {
						return get(
							'<!DOCTYPE html><select id="d"><option id="o1" value="foo">foo</option>' +
								'<option id="o2" value="bar" selected>bar</option></select>'
						)
							.then(function() {
								return session.findById('d');
							})
							.then(function(element) {
								return element.click();
							})
							.then(function() {
								return session.findById('o1');
							})
							.then(function(element) {
								return element.click();
							})
							.then(works, broken);
					};
				}
			}

			// At least MS Edge driver 10240 doesn't support getting the page
			// source
			if (capabilities.brokenPageSource == null) {
				testedCapabilities.brokenPageSource = session
					.getPageSource()
					.then(works, broken);
			}

			if (capabilities.brokenSubmitElement == null) {
				// There is inconsistency across all drivers as to whether or
				// not submitting a form button should cause the form button to
				// be submitted along with the rest of the form; it seems most
				// likely that tests do want the specified button to act as
				// though someone clicked it when it is submitted, so the
				// behaviour needs to be normalised
				testedCapabilities.brokenSubmitElement = function() {
					return get(
						'<!DOCTYPE html><form method="get" action="about:blank">' +
							'<input id="a" type="submit" name="a" value="a"></form>'
					)
						.then(function() {
							return session.findById('a');
						})
						.then(function(element) {
							return element.submit();
						})
						.then(function() {
							return session.getCurrentUrl();
						})
						.then(function(url) {
							return url.indexOf('a=a') === -1;
						})
						.catch(broken);
				};
			}

			// At least MS Edge driver 10240 doesn't support window sizing
			// commands
			if (capabilities.brokenWindowSize == null) {
				testedCapabilities.brokenWindowSize = session
					.getWindowSize()
					.then(works, broken);
			}

			// At least Chrome on Mac doesn't properly maximize. See
			// https://bugs.chromium.org/p/chromedriver/issues/detail?id=985
			if (capabilities.brokenWindowMaximize == null) {
				testedCapabilities.brokenWindowMaximize = function() {
					let originalSize: { width: number; height: number };
					return session
						.getWindowSize()
						.then(size => {
							originalSize = size;
							return session.setWindowSize(
								size.width - 10,
								size.height - 10
							);
						})
						.then(() => session.maximizeWindow())
						.then(() => session.getWindowSize())
						.then(size => {
							return (
								size.width > originalSize.width &&
								size.height > originalSize.height
							);
						})
						.catch(broken);
				};
			}

			// At least Selendroid 0.9.0 has a bug where it catastrophically
			// fails to retrieve available types; they have tried to hardcode
			// the available log types in this version so we can just return
			// the same hardcoded list ourselves.
			// At least InternetExplorerDriver 2.41.0 also fails to provide log
			// types. Firefox 49+ (via geckodriver) doesn't support retrieving
			// logs or log types, and may hang the session.
			if (capabilities.fixedLogTypes == null) {
				testedCapabilities.fixedLogTypes = session
					.getAvailableLogTypes()
					.then(unsupported, function(error: LeadfootError) {
						if (
							capabilities.browserName === 'selendroid' &&
							error.response!.text.length === 0
						) {
							return ['logcat'];
						}

						return [];
					});
			}

			// At least Microsoft Edge 10240 doesn't support timeout values of
			// 0.
			if (capabilities.brokenZeroTimeout == null) {
				testedCapabilities.brokenZeroTimeout = session
					.setTimeout('implicit', 0)
					.then(works, broken);
			}

			if (capabilities.brokenWindowSwitch == null) {
				testedCapabilities.brokenWindowSwitch = session
					.getCurrentWindowHandle()
					.then(function(handle) {
						return session.switchToWindow(handle);
					})
					.then(works, broken);
			}

			if (capabilities.brokenParentFrameSwitch == null) {
				testedCapabilities.brokenParentFrameSwitch = session
					.switchToParentFrame()
					.then(works, broken);
			}

			// This URL is used by several tests below
			const scrollTestUrl =
				'<!DOCTYPE html><div id="a" style="margin: 3000px;"></div>';

			// ios-driver 0.6.6-SNAPSHOT April 2014 calculates position based
			// on a bogus origin and does not account for scrolling
			if (capabilities.brokenElementPosition == null) {
				testedCapabilities.brokenElementPosition = function() {
					return get(scrollTestUrl)
						.then(function() {
							return session.findById('a');
						})
						.then(function(element) {
							return element.getPosition();
						})
						.then(function(position) {
							return position.x !== 3000 || position.y !== 3000;
						})
						.catch(broken);
				};
			}

			// At least ios-driver 0.6.6-SNAPSHOT April 2014 will never
			// complete a refresh call
			if (capabilities.brokenRefresh == null) {
				testedCapabilities.brokenRefresh = function() {
					return session
						.get('about:blank?1')
						.then(function() {
							let timer: NodeJS.Timer;
							let refresh: Task<boolean | void>;

							return new Task(
								resolve => {
									let settled = false;

									refresh = session
										.refresh()
										.then(
											() => {
												settled = true;
												clearTimeout(timer);
												resolve(false);
											},
											() => {
												settled = true;
												clearTimeout(timer);
												resolve(true);
											}
										)
										.finally(() => {
											if (!settled) {
												resolve(true);
											}
										});

									timer = setTimeout(function() {
										refresh.cancel();
									}, 2000);
								},
								() => {
									clearTimeout(timer);
									refresh.cancel();
								}
							);
						})
						.catch(broken);
				};
			}

			if (
				capabilities.brokenMouseEvents == null &&
				capabilities.mouseEnabled
			) {
				// At least IE 10 and 11 on SauceLabs don't fire native mouse
				// events consistently even though they support moveMouseTo
				testedCapabilities.brokenMouseEvents = function() {
					return get(
						'<!DOCTYPE html><div id="foo">foo</div>' +
							'<script>window.counter = 0; var d = document; d.onmousemove = function () { window.counter++; };</script>'
					)
						.then(function() {
							return session.findById('foo');
						})
						.then(function(element) {
							return session.moveMouseTo(element, 20, 20);
						})
						.then(function() {
							return sleep(100);
						})
						.then(function() {
							return session.execute('return window.counter;');
						})
						.then(function(counter) {
							return counter > 0 ? works() : broken();
						}, broken);
				};

				// At least ChromeDriver 2.12 through 2.19 will throw an error
				// if mouse movement relative to the <html> element is
				// attempted
				if (capabilities.brokenHtmlMouseMove == null) {
					testedCapabilities.brokenHtmlMouseMove = function() {
						return get('<!DOCTYPE html><html></html>')
							.then(function() {
								return session
									.findByTagName('html')
									.then(function(element) {
										return session.moveMouseTo(
											element,
											0,
											0
										);
									});
							})
							.then(works, broken);
					};
				}

				// At least ChromeDriver 2.9.248307 does not correctly emit the
				// entire sequence of events that would normally occur during a
				// double-click
				if (capabilities.brokenDoubleClick == null) {
					testedCapabilities.brokenDoubleClick = function retry(): Task<
						any
					> {
						// InternetExplorerDriver is not buggy, but IE9 in
						// quirks-mode is; since we cannot do feature tests in
						// standards-mode in IE<10, force the value to false
						// since it is not broken in this browser
						if (
							capabilities.browserName === 'internet explorer' &&
							capabilities.browserVersion === '9'
						) {
							return Task.resolve(false);
						}

						return get(
							'<!DOCTYPE html><script>window.counter = 0; var d = document; d.onclick = d.onmousedown = d.onmouseup = function () { window.counter++; };</script>'
						)
							.then(function() {
								return session.findByTagName('html');
							})
							.then(function(element) {
								return session.moveMouseTo(element);
							})
							.then(function() {
								return sleep(100);
							})
							.then(function() {
								return session.doubleClick();
							})
							.then(function() {
								return session.execute(
									'return window.counter;'
								);
							})
							.then(function(counter) {
								// InternetExplorerDriver 2.41.0 has a race
								// condition that makes this test sometimes
								// fail
								/* istanbul ignore if: inconsistent race condition */
								if (counter === 0) {
									return retry();
								}

								return counter !== 6;
							})
							.catch(broken);
					};
				}
			}

			if (capabilities.touchEnabled) {
				// At least Selendroid 0.9.0 fails to perform a long tap due to
				// an INJECT_EVENTS permission failure
				if (capabilities.brokenLongTap == null) {
					testedCapabilities.brokenLongTap = session
						.findByTagName('body')
						.then(function(element) {
							return session.longTap(element);
						})
						.then(works, broken);
				}

				// At least ios-driver 0.6.6-SNAPSHOT April 2014 claims to
				// support touch press/move/release but actually fails when you
				// try to use the commands
				if (capabilities.brokenMoveFinger == null) {
					testedCapabilities.brokenMoveFinger = session
						.pressFinger(0, 0)
						.then(works, function(error) {
							return (
								error.name === 'UnknownCommand' ||
								error.message.indexOf(
									'need to specify the JS'
								) > -1
							);
						});
				}

				// Touch scroll in ios-driver 0.6.6-SNAPSHOT is broken, does
				// not scroll at all; in selendroid 0.9.0 it ignores the
				// element argument
				if (capabilities.brokenTouchScroll == null) {
					testedCapabilities.brokenTouchScroll = function() {
						return get(scrollTestUrl)
							.then(function() {
								return session.touchScroll(0, 20);
							})
							.then(function() {
								return session.execute(
									'return window.scrollY !== 20;'
								);
							})
							.then(function(isBroken) {
								if (isBroken) {
									return true;
								}

								return session
									.findById('a')
									.then(function(element) {
										return session.touchScroll(
											element,
											0,
											0
										);
									})
									.then(function() {
										return session.execute(
											'return window.scrollY !== 3000;'
										);
									});
							})
							.catch(broken);
					};
				}

				// Touch flick in ios-driver 0.6.6-SNAPSHOT is broken, does not
				// scroll at all except in very broken ways if very tiny speeds
				// are provided and the flick goes in the wrong direction
				if (capabilities.brokenFlickFinger == null) {
					testedCapabilities.brokenFlickFinger = function() {
						return get(scrollTestUrl)
							.then(function() {
								return session.flickFinger(0, 400);
							})
							.then(function() {
								return session.execute(
									'return window.scrollY === 0;'
								);
							})
							.catch(broken);
					};
				}
			}

			if (
				capabilities.supportsCssTransforms &&
				capabilities.brokenCssTransformedSize == null
			) {
				testedCapabilities.brokenCssTransformedSize = function() {
					return get(
						'<!DOCTYPE html><style>#a{width:8px;height:8px;-ms-transform:scale(0.5);-moz-transform:scale(0.5);-webkit-transform:scale(0.5);transform:scale(0.5);}</style><div id="a"></div>'
					)
						.then(function() {
							return session
								.execute<Element>(
									'return document.getElementById("a");'
								)
								.then(function(element) {
									return element.getSize();
								})
								.then(function(dimensions) {
									return (
										dimensions.width !== 4 ||
										dimensions.height !== 4
									);
								});
						})
						.catch(broken);
				};
			}

			return Task.all(
				Object.keys(testedCapabilities).map(
					key => testedCapabilities[key]
				)
			).then(() => testedCapabilities);
		};

		if (capabilities._filled) {
			return Task.resolve(session);
		}

		// At least geckodriver 0.11 and Firefox 49+ may hang when getting
		// 'about:blank' in the first request
		const promise: Task<Session | void> = isFirefox(
			capabilities,
			49,
			Infinity
		)
			? Task.resolve(session)
			: session.get('about:blank');

		return promise
			.then(discoverServerFeatures)
			.then(addCapabilities)
			.then(discoverFeatures)
			.then(addCapabilities)
			.then(() => session.get('about:blank'))
			.then(discoverDefects)
			.then(addCapabilities)
			.then(() => session.get('about:blank'))
			.then(() => session);
	}

	/**
	 * Gets a list of all currently active remote control sessions on this
	 * server.
	 */
	getSessions(): Task<Session[]> {
		return this.get('sessions').then(function(sessions: any) {
			// At least BrowserStack is now returning an array for the sessions
			// response
			if (sessions && !Array.isArray(sessions)) {
				sessions = returnValue(sessions);
			}

			// At least ChromeDriver 2.19 uses the wrong keys
			// https://code.google.com/p/chromedriver/issues/detail?id=1229
			sessions.forEach(function(session: any) {
				if (session.sessionId && !session.id) {
					session.id = session.sessionId;
				}
			});

			return sessions;
		});
	}

	/**
	 * Gets information on the capabilities of a given session from the server.
	 * The list of capabilities returned by this command will not include any
	 * of the extra session capabilities detected by Leadfoot and may be
	 * inaccurate.
	 */
	getSessionCapabilities(sessionId: string): Task<Capabilities> {
		return this.get('session/$0', undefined, [sessionId]).then(returnValue);
	}

	/**
	 * Terminates a session on the server.
	 */
	deleteSession(sessionId: string) {
		return this.delete<void>('session/$0', undefined, [sessionId]).then(
			noop
		);
	}
}

export type Method = 'post' | 'get' | 'delete';

function isMac(capabilities: Capabilities) {
	return (
		capabilities.platform === 'MAC' && capabilities.platformName !== 'ios'
	);
}

function isMsEdge(
	capabilities: Capabilities,
	minOrExactVersion?: number,
	maxVersion?: number
) {
	if (capabilities.browserName !== 'MicrosoftEdge') {
		return false;
	}

	return isValidVersion(capabilities, minOrExactVersion, maxVersion);
}

function isInternetExplorer(
	capabilities: Capabilities,
	minOrExactVersion?: number,
	maxVersion?: number
) {
	if (capabilities.browserName !== 'internet explorer') {
		return false;
	}

	return isValidVersion(capabilities, minOrExactVersion, maxVersion);
}

function isSafari(
	capabilities: Capabilities,
	minOrExactVersion?: number,
	maxVersion?: number
) {
	if (capabilities.browserName !== 'safari') {
		return false;
	}

	return isValidVersion(capabilities, minOrExactVersion, maxVersion);
}

function isFirefox(
	capabilities: Capabilities,
	minOrExactVersion?: number,
	maxVersion?: number
) {
	if (capabilities.browserName !== 'firefox') {
		return false;
	}

	return isValidVersion(capabilities, minOrExactVersion, maxVersion);
}

/**
 * Check if a browserVersion is between a min (inclusive) and a max
 * (exclusive). If only one version is specified, it is treated as an exact
 * match.
 */
function isValidVersion(
	capabilities: Capabilities,
	minOrExactVersion?: number,
	maxVersion?: number
) {
	if (minOrExactVersion != null) {
		const version = parseFloat(
			(capabilities.version || capabilities.browserVersion)!
		);

		if (maxVersion != null) {
			if (version < minOrExactVersion) {
				return false;
			}
			if (version >= maxVersion) {
				return false;
			}
		} else if (version !== minOrExactVersion) {
			return false;
		}
	}

	return true;
}

function noop() {}

/**
 * Returns the actual response value from the remote environment.
 *
 * @param response JsonWireProtocol response object.
 * @returns The actual response value.
 */
function returnValue(response: any): any {
	return response.value;
}

interface ResponseData {
	response: ResponseInterface;
	data: any;
}
