import registerSuite = require('intern!object');
import * as assert from 'intern/chai!assert';
import Command from '../../src/Command';
import * as compat from '../../src/compat';
import * as util from './support/util';
import { IRequire } from 'dojo/loader';

declare const require: IRequire;

registerSuite(function () {
	let command: any;
	return {
		name: 'leadfoot/compat',

		setup() {
			return util.createSessionFromRemote(this.remote).then(function (session) {
				class CompatCommand extends Command<any> {
				}
				compat.applyTo(CompatCommand.prototype);

				command = new CompatCommand(session);
			});
		},

		'#waitForElement'() {
			return command
				.get(require.toUrl('tests/functional/data/default.html'))
				.waitForElement('id', 'not-existing', 100).then(function () {
					throw new Error('Non-existing element should cause rejection');
				}, function (error) {
					assert.strictEqual(error.name, 'NoSuchElement');
					return command.get(require.toUrl('tests/functional/data/elements.html'))
						.findById('makeD')
							.click()
							.end()
						// The test will simply time out if this fails; this is in order to exercise the default
						// code path that sets the timeout to Infinity
						.waitForElement('id', 'd');
				});
		},

		'#waitForElement context'() {
			return command
				.get(require.toUrl('tests/functional/data/default.html'))
				.waitForElementByTagName('p')
				.then(function () {
					assert.lengthOf(this.context, 0, 'waitForElement should not generate an element context');
				});
		},

		'#waitForVisible'() {
			return command
				.get(require.toUrl('tests/functional/data/default.html'))
				.waitForVisible('id', 'not-existing', 100)
				.then(function () {
					throw new Error('Non-existing element should cause rejection');
				}, function (error) {
					assert.strictEqual(error.name, 'NoSuchElement');
					return command.get(require.toUrl('tests/functional/data/elements.html'))
						.findById('makeD')
							.click()
							.end()
						.waitForVisible('id', 'd');
				});
		},

		'#isVisible'() {
			return command
				.get(require.toUrl('tests/functional/data/visibility.html'))
				.findById('normal')
					.then(function (element) {
						return command.isVisible(element).then(function (isVisible) {
							assert.isTrue(isVisible);
						});
					})
					.isVisible()
					.then(function (isVisible) {
						assert.isTrue(isVisible);
					})
					.end()
				.findById('noDisplay')
					.isVisible()
					.then(function (isVisible) {
						assert.isFalse(isVisible);
					})
					.end()
				.isVisible('id', 'noDisplay')
				.then(function (isVisible) {
					assert.isFalse(isVisible);
				});
		},

		'#text'() {
			const expected = 'Frame\nPi pi pi pi pi\n(I\'m just a faint memory. You don\'t usually remember me.\n' +
				'But you\'ve heard my song in the back of your mind.)';

			return command
				.get(require.toUrl('tests/functional/data/frame.html'))
				.text()
				.then(function (text) {
					assert.strictEqual(
						text,
						expected,
						'Should retrieve all body text if no context element'
					);
				})
				.text('body')
				.then(function (text) {
					assert.strictEqual(text, expected);
				})
				.findById('child')
					.text()
					.then(function (text) {
						assert.strictEqual(text, 'Frame');
					});
		}
	};
});
