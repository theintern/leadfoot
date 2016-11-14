/**
 * Common utility methods.
 * @module leadfoot/util
 */

import * as lang from 'dojo/lang';
import Promise = require('dojo/Promise');

/**
 * Creates a promise that resolves itself after `ms` milliseconds.
 *
 * @param {number} ms Time until resolution in milliseconds.
 * @returns {Promise.<void>}
 */
export function sleep(ms: number): Promise<void> {
	return new Promise<void>(function (resolve, reject, progress, setCanceller) {
		setCanceller(function (reason) {
			clearTimeout(timer);
			throw reason;
		});

		const timer = setTimeout(() => {
			resolve();
		}, ms);
	});
}

/**
 * Annotates the method with additional properties that provide guidance to {@link module:leadfoot/Command} about
 * how the method interacts with stored context elements.
 *
 * @param {Function} fn
 * @param {{ usesElement: boolean=, createsContext: boolean= }} properties
 * @returns {Function}
 */
export function forCommand(fn: Function, properties: { usesElement?: boolean, createsContext?: boolean }): Function {
	return lang.mixin(fn, properties);
}

/**
 * Converts a function to a string representation suitable for use with the `execute` API endpoint.
 *
 * @param {Function|string} fn
 * @returns {string}
 */
export function toExecuteString(fn: Function|string): string {
	if (typeof fn === 'function') {
		// If someone runs code through Istanbul in the test runner, inline functions that are supposed to execute
		// on the client will contain code coverage variables that will cause script execution failure. These
		// statements are very simple and are generated in a consistent manner, so we can get rid of them easily
		// with a regular expression
		fn = fn.toString().replace(/\b__cov_[^,;]+[,;]/g, '');
		fn = 'return (' + fn + ').apply(this, arguments);';
	}

	return fn;
}

/**
 * Removes the first line of a stack trace, which in V8 is the string representation of the object holding the stack
 * trace (which is garbage for captured stack traces).
 */
export function trimStack(stack: string): string {
	return stack.replace(/^[^\n]+/, '');
}

export function applyMixins(derivedCtor: any, baseCtors: any[], includePrivates: boolean = true): void {
	baseCtors.forEach(baseCtor => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
			if (includePrivates || name.charAt(0) !== '_') {
				derivedCtor.prototype[name] = baseCtor.prototype[name];
			}
		});
	});
}
