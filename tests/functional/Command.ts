import registerSuite = require('intern!object');
import * as assert from 'intern/chai!assert';
import * as util from './support/util';
import Command, { Context } from 'src/Command';
import Session from 'src/Session';
import { IRequire } from 'dojo/loader';
import CancelablePromise from 'src/lib/CancelablePromise';
import Test = require('intern/lib/Test');

declare const require: IRequire;

registerSuite(function () {
	let session: Session;

	return {
		name: 'Command',
		setup: function (this: Test) {
			const remote = <any> this.remote;
			return util.createSessionFromRemote(remote).then(function () {
				session = arguments[0];
			});
		},

		beforeEach: function () {
			return session.get('about:blank').then(function () {
				return session.setTimeout('implicit', 0);
			});
		},

		'error handling': {
			'DEBUG initialiser throws'() {
				return new Command(session, function () {
					throw new Error('broken');
				}).then(function () {
					throw new Error('Error thrown in initialiser should reject the Command');
				}, function (error: Error) {
					assert.strictEqual(error.message, 'broken');
					assert.include(error.stack, 'tests/functional/Command.js:92:31',
						'Stack trace should point back to the error');
					error.message += ' 2';
					throw error;
				}).then(function () {
					throw new Error('Error thrown in parent Command should reject child Command');
				}, function (error: Error) {
					assert.strictEqual(error.message, 'broken 2');
				});
			},

			'DEBUG invalid async command'() {
				const command: any = new Command(session).sleep(100);
				Command.addSessionMethod(command, 'invalid', function () {
					return new CancelablePromise(function (resolve, reject) {
						setTimeout(function () {
							reject(new Error('Invalid call'));
						}, 0);
					});
				});

				return command
					.invalid()
					.then(function () {
						throw new Error('Invalid command should have thrown error');
					}, function (error: Error) {
						assert.strictEqual(error.message, 'Invalid call');
						assert.include(error.stack.slice(0, error.stack.indexOf('\n')), error.message,
							'Original error message should be provided on the first line of the stack trace');
						assert.include(error.stack, 'tests/functional/Command.js:131',
							'Stack trace should point back to the async method call that eventually threw the error');
					});
			},

			'catch recovery'() {
				return new Command(session)
					.then(function () {
						throw new Error('Boom');
					}).catch(function (this: Command<any>) {
						const expected: Context = [];
						expected.isSingle = true;
						expected.depth = 0;
						assert.deepEqual(this.context, expected, 'Context should be copied in error path');
					});
			}
		},

		'initialisation'(this: Test) {
			assert.throws(function () {
				/*jshint nonew:false */
				new (<any> Command)();
			}, /A parent Command or Session must be provided to a new Command/);

			const dfd = this.async();
			const parent = new Command(session, function (setContext) {
				setContext('foo');
				return CancelablePromise.resolve('bar');
			});

			const expectedContext: Context = [ 'foo' ];
			expectedContext.isSingle = true;
			expectedContext.depth = 0;

			const command = parent.then(function (this: Command<any>, returnValue: string) {
				const self = this;
				// setTimeout is necessary because underlying Promise implementation resolves same-turn and so
				// `command` is still not defined when this callback executes
				setTimeout(dfd.callback(function () {
					assert.strictEqual(self, command, 'The `this` object in callbacks should be the Command object');
					assert.deepEqual(command.context, expectedContext, 'The context of the Command should be set by the initialiser');
					assert.deepEqual(returnValue, 'bar', 'The return value of the initialiser should be exposed to the first callback');
				}), 0);
			});

			return dfd.promise;
		},

		'basic chaining'() {
			const command = new Command(session);
			return command.get(require.toUrl('tests/functional/data/default.html'))
				.getPageTitle()
				.then(function (pageTitle: string) {
					assert.strictEqual(pageTitle, 'Default & <b>default</b>');
				})
				.get(require.toUrl('tests/functional/data/form.html'))
				.getPageTitle()
				.then(function (pageTitle: string) {
					assert.strictEqual(pageTitle, 'Form');
				});
		},

		'child is a separate command'() {
			const parent = new Command(session).get(require.toUrl('tests/functional/data/default.html'));
			const child = parent.findByTagName('p');

			return child.then(function (element: Element) {
					assert.notStrictEqual(child, parent, 'Getting an element should cause a new Command to be created');
					assert.isObject(element, 'Element should be provided to first callback of new Command');
				}).getTagName()
				.then(function (tagName: string) {
					assert.strictEqual(tagName, 'p', 'Tag name of context element should be provided');
				});
		},

		'basic form interaction'() {
			const command = new Command(session);
			return command.get(require.toUrl('tests/functional/data/form.html'))
				.findById('input')
					.click()
					.type('hello')
					.getProperty('value')
					.then(function (value: string) {
						assert.strictEqual(value, 'hello', 'Typing into a form field should put data in the field');
					});
		},

		'#findAll'() {
			return new Command(session).get(require.toUrl('tests/functional/data/elements.html'))
				.findAllByClassName('b')
				.getAttribute('id')
				.then(function (ids: string[]) {
					assert.deepEqual(ids, [ 'b2', 'b1', 'b3', 'b4' ]);
				});
		},

		'#findAll chain'() {
			return new Command(session).get(require.toUrl('tests/functional/data/elements.html'))
				.findById('c')
					.findAllByClassName('b')
						.getAttribute('id')
						.then(function (ids: string[]) {
							assert.deepEqual(ids, [ 'b3', 'b4' ]);
						})
						.findAllByClassName('a')
							.then(function (elements: Element[]) {
								assert.lengthOf(elements, 0);
							})
					.end(2)
				.end()
				.findAllByClassName('b')
					.getAttribute('id')
					.then(function (ids: string[]) {
						assert.deepEqual(ids, [ 'b2', 'b1', 'b3', 'b4' ]);
					});
		},

		'#findAll + #findAll'() {
			return new Command(session).get(require.toUrl('tests/functional/data/elements.html'))
				.findAllByTagName('div')
					.findAllByCssSelector('span, a')
						.getAttribute('id')
						.then(function (ids: string[]) {
							assert.deepEqual(ids, [ 'f', 'g', 'j', 'i1', 'k', 'zz' ]);
						});
		},

		'#findDisplayed'() {
			return new Command(session).get(require.toUrl('tests/functional/data/visibility.html'))
				.findDisplayedByClassName('multipleVisible')
				.getVisibleText()
				.then(function (text: string) {
					assert.strictEqual(text, 'b', 'The first visible element should be returned');
				});
		},

		// Check that when the mouse is pressed on one element and is moved over another element before being
		// released, the mousedown event is generated for the first element and the mouseup event is generated for
		// the second.
		'#moveMouseTo usesElement'() {
			return new Command(session).get(require.toUrl('tests/functional/data/pointer.html'))
				.findById('a')
				.moveMouseTo()
				.pressMouseButton()
				.moveMouseTo(110, 50)
				.releaseMouseButton()
				.execute('return result;')
				.then(function (result: any) {
					assert.isTrue(result.mousedown.a && result.mousedown.a.length > 0, 'Expected mousedown event in element a');
					assert.isTrue(result.mouseup.b && result.mouseup.b.length > 0, 'Expected mouseup event in element b');
				});
		},

		'#sleep'() {
			const startTime = Date.now();
			return new Command(session)
				.sleep(2000)
				.then(function () {
					assert.closeTo(Date.now() - startTime, 2000, 200,
						'Sleep should prevent next command from executing for the specified amount of time');
				});
		},

		'#end beyond the top of the command list'() {
			const expected: Context = [ 'a' ];
			expected.depth = 0;

			return new Command(session, function (setContext) { setContext([ 'a' ]); })
				.end(20)
				.then(function (this: Command<any>) {
					assert.deepEqual(this.context, expected, 'Calling #end when there is nowhere else to go should be a no-op');
				});
		},

		'#end in a long chain'() {
			return new Command(session).then(function (_: any, setContext: Function) {
				setContext([ 'a' ]);
			})
			.end()
			.then(function (this: Command<any>) {
				assert.lengthOf(this.context, 0);
			})
			.end()
			.then(function (this: Command<any>) {
				assert.lengthOf(this.context, 0, '#end should not ascend to higher depths earlier in the command chain');
			});
		},

		'#catch'() {
			const command = new Command(session);
			let callback: Function;
			let errback: Function;
			const expectedErrback = function () {};
			command.then = <any> function () {
				callback = arguments[0];
				errback = arguments[1];
				return 'thenCalled';
			};
			const result = command.catch(expectedErrback);
			assert.strictEqual(result, 'thenCalled');
			assert.isNull(callback);
			assert.strictEqual(errback, expectedErrback);
		},

		'#finally'() {
			const command = new Command(session);
			let callback: Function;
			let errback: Function;
			const expected = function () {};
			command.then = <any> function (cb: Function, eb: Function) {
				callback = cb;
				errback = eb;
				return 'thenCalled';
			};
			const result = command.finally(expected);
			assert.strictEqual(result, 'thenCalled');
			assert.strictEqual(callback, expected);
			assert.strictEqual(errback, expected);
		},

		'#cancel'() {
			const command = new Command(session);
			const sleepCommand = command.sleep(5000);
			sleepCommand.cancel();

			const startTime = Date.now();

			return sleepCommand.then(function () {
				throw new Error('Sleep command should have been cancelled');
			}, function (error: Error) {
				assert.operator(Date.now() - startTime, '<', 4000, 'Cancel should not wait for sleep to complete');
				assert.strictEqual(error.name, 'CancelError');
			});
		},

		'session createsContext'() {
			const command: any = new Command(session, function (setContext) {
				setContext('a');
			});

			Command.addSessionMethod(command, 'newContext', util.forCommand(function () {
				return CancelablePromise.resolve('b');
			}, { createsContext: true }));

			return command.newContext().then(function (this: Command<any>) {
				const expected: Context = [ 'b' ];
				expected.isSingle = true;
				expected.depth = 1;

				assert.deepEqual(this.context, expected,
					'Function that returns a value that has been annotated with createsContext should generate a new context');
			});
		},

		'element createsContext'() {
			const command: any = new Command(session, function (setContext) {
				setContext({
					elementId: 'farts',
					newContext: util.forCommand(function () {
						return CancelablePromise.resolve('b');
					}, { createsContext: true })
				});
			});

			Command.addElementMethod(command, 'newContext');

			return command.newContext().then(function (this: Command<any>) {
				const expected: Context = [ 'b' ];
				expected.isSingle = true;
				expected.depth = 1;

				assert.deepEqual(this.context, expected,
					'Function that returns a value that has been annotated with createsContext should generate a new context');
			});
		},

		'session usesElement single'() {
			const command: any = new Command(session, function (setContext) {
				setContext('a');
			});

			Command.addSessionMethod(command, 'useElement', util.forCommand(function (context: string, arg: string) {
				assert.strictEqual(context, 'a',
					'Context object should be passed as first argument to function annotated with usesElement');
				assert.strictEqual(arg, 'arg1',
					'Arguments should be passed after the context');
			}, { usesElement: true }));

			return command.useElement('arg1');
		},

		'session usesElement multiple'() {
			const command: any = new Command(session, function (setContext) {
				setContext([ 'a', 'b' ]);
			});

			const expected = [
				[ 'a', 'arg1' ],
				[ 'b', 'arg1' ]
			];

			Command.addSessionMethod(command, 'useElement', util.forCommand(function (context: any, arg: any) {
				const _expected = expected.shift();

				assert.strictEqual(context, _expected[0],
					'Context object should be passed as first argument to function annotated with usesElement');
				assert.strictEqual(arg, _expected[1],
					'Arguments should be passed after the context');
			}, { usesElement: true }));

			return command.useElement('arg1');
		}
	};
});
