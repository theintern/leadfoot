import registerSuite = require('intern!object');
import * as assert from 'intern/chai!assert';
import Command from '../../../src/Command';
import Session from '../../../src/Session';
import pollUntil from '../../../src/helpers/pollUntil';
import * as util from '../support/util';
import { IRequire } from 'dojo/loader';
import Test = require('intern/lib/Test');

declare const require: IRequire;

registerSuite(function (this: Test) {
	let command: Command<any>;
	return {
		name: 'leadfoot/helpers/pollUntil',

		setup(this: Test) {
			const remote  = <any> this.remote;
			return util.createSessionFromRemote(remote)
			.then(function (session: Session) {
				command = new Command<void>(session);
			});
		},

		'basic test'() {
			return command
				.get(require.toUrl('tests/functional/data/elements.html'))
				.findById('makeD')
				.click()
				.then(pollUntil('return document.getElementById("d");', [], 1000))
				.then(function (result: any) {
					assert.property(result, 'elementId', 'Returned value should be an element');
				});
		},

		'without args'() {
			return command
				.get(require.toUrl('tests/functional/data/elements.html'))
				.findById('makeD')
				.click()
				.then(pollUntil('return document.getElementById("d");', 1000))
				.then(function (result: any) {
					assert.property(result, 'elementId', 'Returned value should be an element');
				});
		},

		'early timeout'() {
			return command
				.get(require.toUrl('tests/functional/data/elements.html'))
				.findById('makeDSlowly')
				.click()
				.then(pollUntil('return document.getElementById("d");', [], 100, 25))
				.then(
					function () {
						throw new Error('Polling should fail after a timeout');
					},
					function (error: Error) {
						assert.strictEqual(error.name, 'ScriptTimeout');
					}
				);
		},

		'iteration check'() {
			/* jshint browser:true */
			return command
				.get(require.toUrl('tests/functional/data/default.html'))
				.then(pollUntil(function () {
					const anyWindow = <any> window;
					if (!anyWindow.counter) {
						anyWindow.counter = 0;
					}

					if ((++anyWindow.counter) === 4) {
						return anyWindow.counter;
					}
				}, [], 1000, 25))
				.then(function (counter: number) {
					assert.strictEqual(counter, 4);
				});
		}
	};
});
