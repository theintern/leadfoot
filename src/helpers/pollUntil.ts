/**
 * @module leadfoot/helpers/pollUntil
 */

import * as util from '../lib/util';
import Command from '../Command';
import Promise = require('dojo/Promise');

/**
 * A {@link module:leadfoot/Command} helper that polls for a value within the client environment until the value exists
 * or a timeout is reached.
 *
 * @param {Function|string} poller
 * The poller function to execute on an interval. The function should return `null` or `undefined` if there is not a
 * result. If the poller function throws, polling will halt.
 *
 * @param {Array.<any>=} args
 * An array of arguments to pass to the poller function when it is invoked. Only values that can be serialised to JSON,
 * plus {@link module:leadfoot/Element} objects, can be specified as arguments.
 *
 * @param {number=} timeout
 * The maximum amount of time to wait for a successful result, in milliseconds. If not specified, the current
 * `executeAsync` maximum timeout for the session will be used.
 *
 * @param {number=} pollInterval
 * The amount of time to wait between calls to the poller function, in milliseconds. If not specified, defaults to 67ms.
 *
 * @returns {function(): Promise.<any>}
 * A {@link module:leadfoot/Command#then} callback function that, when called, returns a promise that resolves to the
 * value returned by the poller function on success and rejects on failure.
 *
 * @example
 * var Command = require('leadfoot/Command');
 * var pollUntil = require('leadfoot/helpers/pollUntil');
 *
 * new Command(session)
 *     .get('http://example.com')
 *     .then(pollUntil('return document.getElementById("a");', 1000))
 *     .then(function (elementA) {
 *         // element was found
 *     }, function (error) {
 *         // element was not found
 *     });
 *
 * @example
 * var Command = require('leadfoot/Command');
 * var pollUntil = require('leadfoot/helpers/pollUntil');
 *
 * new Command(session)
 *     .get('http://example.com')
 *     .then(pollUntil(function (value) {
 *         var element = document.getElementById('a');
 *         return element && element.value === value ? true : null;
 *     }, [ 'foo' ], 1000))
 *     .then(function () {
 *         // value was set to 'foo'
 *     }, function (error) {
 *         // value was never set
 *     });
 */
function pollUntil(poller: Function|string, args?: any[], timeout?: number, pollInterval?: number): () => Promise<any>;
function pollUntil(poller: Function|string, timeout?: number, pollInterval?: number): () => Promise<any>;
function pollUntil(...allArgs: any[]): () => Promise<any> {
	let [ poller, args, timeout, pollInterval ] = allArgs;
	if (typeof args === 'number') {
		pollInterval = timeout;
		timeout = args;
		args = [];
	}

	args = args || [];
	pollInterval = pollInterval || 67;

	return function (this: Command) {
		const session = this.session;
		let originalTimeout: number;

		return session.getExecuteAsyncTimeout().then(function () {
			let resultOrError: any;

			function storeResult(result: any) {
				resultOrError = result;
			}

			if (!isNaN(timeout)) {
				originalTimeout = arguments[0];
			}
			else {
				timeout = arguments[0];
			}

			return session.setExecuteAsyncTimeout(timeout)
				.then(function () {
					/* jshint maxlen:140 */
					return session.executeAsync(/* istanbul ignore next */ function (poller: string|Function, args: any[], timeout: number, pollInterval: number, done: Function): void {
						/* jshint evil:true */
						poller = <Function> new Function(<string> poller);

						const endTime = Number(new Date()) + timeout;

						(function poll(this: any) {
							const result = poller.apply(this, args);

							/*jshint evil:true */
							if (result != null) {
								done(result);
							}
							else if (Number(new Date()) < endTime) {
								setTimeout(poll, pollInterval);
							}
							else {
								done(null);
							}
						})();
					}, [ util.toExecuteString(poller), args, timeout, pollInterval ]);
				})
				.then(storeResult, storeResult)
				.finally(function () {
					function finish() {
						if (resultOrError instanceof Error) {
							throw resultOrError;
						}
						if (resultOrError === null) {
							const error = new Error('Polling timed out with no result');
							error.name = 'ScriptTimeout';
							throw error;
						}
						return resultOrError;
					}

					if (!isNaN(originalTimeout)) {
						return session.setExecuteAsyncTimeout(originalTimeout).then(finish);
					}
					return finish();
				});
		});
	};
}

export = pollUntil;
