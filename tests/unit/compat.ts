import registerSuite = require('intern!object');
import * as assert from 'intern/chai!assert';
import Promise = require('dojo/Promise');
import Session from '../../src/Session';
import Command from '../../src/Command';
import * as compat from '../../src/compat';
import Strategies, { suffixes } from '../../src/lib/strategies';
import * as topic from 'dojo/topic';

function assertWarn(...args: any[]) {
	assert.isNotNull(lastWarning);
	for (let i = 0, j = args.length; i < j; ++i) {
		args[i] && assert.include(lastWarning[i], args[i]);
	}
}

function mockCommand(object, method, testName, test) {
	let originalMethod;
	let suite = {
		setup: function () {
			originalMethod = object[method];
			object[method] = function (...args: any[]) {
				return new Command(this, function () {
					if (args[0] instanceof Error) {
						return Promise.reject(args[0]);
					}

					return Promise.resolve(args);
				});
			};
		},
		teardown: function () {
			object[method] = originalMethod;
		}
	};

	suite[testName] = test;
	return suite;
}

function deprecate(method: string, replacement?: string) {
	return mockCommand(command, replacement, 'deprecate', function () {
		return command[method]('a', 'b').then(function (value) {
			assert.deepEqual(value, [ 'a', 'b' ], 'Replacement method should be invoked with same arguments');
			assertWarn('Command#' + method, 'Command#' + replacement);
		});
	});
}

function deprecateElementSig(fromMethod: string, toMethod?: string, standardSigAlsoDeprecated?: boolean) {
	return mockCommand(Command.prototype, fromMethod, 'deprecateElementSig', function () {
		function testElementSig() {
			return command[fromMethod](element, 'c', 'd').then(function (value) {
				assert.deepEqual(value, [ 'c', 'd' ]);
				assertWarn('Command#' + fromMethod + '(element)', 'Command#find then Command#' + fromMethod);
				assertWarn('Command#' + fromMethod + '(element)', 'element.' + (toMethod || fromMethod));
			});
		}

		let element = {
			elementId: 'test'
		};
		element[toMethod || fromMethod] = function () {
			return Promise.resolve(Array.prototype.slice.call(arguments, 0));
		};

		if (standardSigAlsoDeprecated) {
			return testElementSig();
		}

		return command[fromMethod]('a', 'b').then(function (value) {
			assert.deepEqual(value, [ 'a', 'b' ], 'Unmodified method should be invoked with same arguments');
			assert.isNull(lastWarning);
			return testElementSig();
		});
	});
}

function deprecateElementAndStandardSig(method, replacement) {
	return {
		'element signature': deprecateElementSig(method, replacement, true),
		'standard signature': deprecate(method, replacement)
	};
}

const capabilities: any = {};

class CompatCommand extends Command<any> {
}

compat.applyTo(CompatCommand.prototype);

let command: any = new CompatCommand(new Session('test', <any> {
	getStatus: function () {
		return Promise.resolve('hapy');
	},
	getSessions: function () {
		return Promise.resolve('many things');
	},
	_get: function () {
		return Promise.resolve(arguments);
	},
	_post: function () {
		return Promise.resolve(arguments);
	},
	_delete: function () {
		return Promise.resolve(arguments);
	}
}, capabilities));

let handle = topic.subscribe('/deprecated', function () {
	lastWarning = arguments;
});

let lastWarning: any;

let suite = {
	name: 'leadfoot/compat',

	beforeEach: function () {
		lastWarning = null;
	},

	teardown: function () {
		handle.remove();
		lastWarning = command = handle = null;
	},

	'assertion sanity check': function () {
		assert.throws(function () {
			assertWarn('a');
		});
	},

	'mockCommand sanity check': mockCommand(command, 'test', 'sanity check', function () {
		return command.test('a', 'b').then(function (args) {
			assert.deepEqual(args, [ 'a', 'b' ]);
			return command.test(new Error('Should reject'));
		}).then(function () {
			throw new Error('Should have rejected');
		}, function (error) {
			assert.strictEqual(error.message, 'Should reject');
		});
	}),

	'#sessionID': function () {
		assert.strictEqual(command.sessionID, command.session.sessionId);
		assertWarn('Command#sessionID', 'Command#session.sessionId');
	},

	'#status': function () {
		return command.status().then(function (value) {
			assert.strictEqual(value, 'hapy');
			assertWarn('Command#status');
		});
	},

	'#init': function () {
		assert.strictEqual(command.init(), command);
		assertWarn('Command#init');
	},

	'#sessions': function () {
		return command.sessions().then(function (value) {
			assert.strictEqual(value, 'many things');
			assertWarn('Command#sessions');
		});
	},

	'#sessionCapabilities': function () {
		return command.sessionCapabilities().then(function (capabilities) {
			assert.strictEqual(capabilities, command.session.capabilities);
			assertWarn('Command#sessionCapabilities', 'Command#session.capabilities');
		});
	},

	'#altSessionCapabilities': function () {
		return command.altSessionCapabilities().then(function (capabilities) {
			assert.strictEqual(capabilities, command.session.capabilities);
			assertWarn('Command#altSessionCapabilities', 'Command#session.capabilities');
		});
	},

	'#getSessionId': function () {
		return command.getSessionId().then(function (sessionId) {
			assert.strictEqual(sessionId, command.session.sessionId);
			assertWarn('Command#getSessionId', 'Command#session.sessionId');
		});
	},

	'#getSessionID': function () {
		return command.getSessionID().then(function (sessionId) {
			assert.strictEqual(sessionId, command.session.sessionId);
			assertWarn('Command#getSessionID', 'Command#session.sessionId');
		});
	},

	'#setAsyncScriptTimeout': deprecate('setAsyncScriptTimeout', 'setExecuteAsyncTimeout'),
	'#setWaitTimeout': deprecate('setWaitTimeout', 'setFindTimeout'),
	'#setImplicitWaitTimeout': deprecate('setImplicitWaitTimeout', 'setFindTimeout'),
	'#windowHandle': deprecate('windowHandle', 'getCurrentWindowHandle'),
	'#windowHandles': deprecate('windowHandles', 'getAllWindowHandles'),
	'#url': deprecate('url', 'getCurrentUrl'),
	'#forward': deprecate('forward', 'goForward'),
	'#back': deprecate('back', 'goBack'),
	'#safeExecute': deprecate('safeExecute', 'execute'),
	'#eval': mockCommand(command, 'execute', 'eval', function () {
		/* jshint evil:true */
		return command.eval('test').then(function (args) {
			assert.strictEqual(args[0], 'return eval(arguments[0]);');
			assert.deepEqual(args[1], [ 'test' ]);
			assertWarn('Command#eval', 'Command#execute');
		});
	}),
	'#safeEval': mockCommand(command, 'execute', 'eval', function () {
		return command.safeEval('test').then(function (args) {
			assert.strictEqual(args[0], 'return eval(arguments[0]);');
			assert.deepEqual(args[1], [ 'test' ]);
			assertWarn('Command#safeEval', 'Command#execute');
		});
	}),
	'#safeExecuteAsync': deprecate('safeExecuteAsync', 'executeAsync'),
	'#frame': deprecate('frame', 'switchToFrame'),
	'#window': deprecate('window', 'switchToWindow'),
	'#close': deprecate('close', 'closeCurrentWindow'),
	'#windowSize': deprecate('windowSize', 'setWindowSize'),
	'#setWindowSize': mockCommand(Command.prototype, 'setWindowSize', 'setWindowSize', function () {
		return command.setWindowSize(1, 2).then(function (args) {
			assert.deepEqual(args, [ 1, 2 ]);
			assert.isNull(lastWarning);
			return command.setWindowSize('foo', 2, 3);
		}).then(function (args) {
			assert.deepEqual(args, [ 'foo', 2, 3 ]);
			assert.isNull(lastWarning);
			return command.setWindowSize(3, 4, 'bar');
		}).then(function (args) {
			assert.deepEqual(args, [ 'bar', 3, 4 ]);
			assertWarn(
				'Command#setWindowSize(width, height, handle)',
				'Command#setWindowSize(handle, width, height)'
			);
		});
	}),
	'#setWindowPosition': mockCommand(Command.prototype, 'setWindowPosition', 'setWindowPosition', function () {
		return command.setWindowPosition(1, 2).then(function (args) {
			assert.deepEqual(args, [ 1, 2 ]);
			assert.isNull(lastWarning);
			return command.setWindowPosition('foo', 2, 3);
		}).then(function (args) {
			assert.deepEqual(args, [ 'foo', 2, 3 ]);
			assert.isNull(lastWarning);
			return command.setWindowPosition(3, 4, 'bar');
		}).then(function (args) {
			assert.deepEqual(args, [ 'bar', 3, 4 ]);
			assertWarn('Command#setWindowPosition(x, y, handle)', 'Command#setWindowPosition(handle, x, y)');
		});
	}),
	'#maximize': deprecate('maximize', 'maximizeWindow'),
	'#allCookies': deprecate('allCookies', 'getCookies'),
	'#deleteAllCookies': deprecate('deleteAllCookies', 'clearCookies'),
	'#source': deprecate('source', 'getPageSource'),
	'#title': deprecate('title', 'getPageTitle'),
	'#element': deprecate('element', 'find'),
	'#elementByClassName': deprecate('elementByClassName', 'findByClassName'),
	'#elementByCssSelector': deprecate('elementByCssSelector', 'findByCssSelector'),
	'#elementById': deprecate('elementById', 'findById'),
	'#elementByName': deprecate('elementByName', 'findByName'),
	'#elementByLinkText': deprecate('elementByLinkText', 'findByLinkText'),
	'#elementByPartialLinkText': deprecate('elementByPartialLinkText', 'findByPartialLinkText'),
	'#elementByTagName': deprecate('elementByTagName', 'findByTagName'),
	'#elementByXPath': deprecate('elementByXPath', 'findByXpath'),
	'#elementByCss': deprecate('elementByCss', 'findByCssSelector'),
	'#elements': deprecate('elements', 'findAll'),
	'#elementsByClassName': deprecate('elementsByClassName', 'findAllByClassName'),
	'#elementsByCssSelector': deprecate('elementsByCssSelector', 'findAllByCssSelector'),
	'#elementsById': mockCommand(command, 'findAll', 'elementsById', function () {
		return command.elementsById('a').then(function (args) {
			assert.deepEqual(args, [ 'id', 'a' ]);
			assertWarn('Command#elementsById', 'Command#findById');
		});
	}),
	'#elementsByName': deprecate('elementsByName', 'findAllByName'),
	'#elementsByLinkText': deprecate('elementsByLinkText', 'findAllByLinkText'),
	'#elementsByPartialLinkText': deprecate('elementsByPartialLinkText', 'findAllByPartialLinkText'),
	'#elementsByTagName': deprecate('elementsByTagName', 'findAllByTagName'),
	'#elementsByXPath': deprecate('elementsByXPath', 'findAllByXpath'),
	'#elementsByCss': deprecate('elementsByCss', 'findAllByCssSelector'),
	'#elementOrNull': mockCommand(command, 'find', 'elementOrNull', function () {
		return command.elementOrNull('a', 'b').then(function (args) {
			assert.deepEqual(args, [ 'a', 'b' ]);
			return command.elementOrNull(new Error('Should resolve to null, not reject'));
		}).then(function (result) {
			assert.isNull(result);
		});
	}),
	'#elementIfExists': mockCommand(command, 'find', 'elementIfExists', function () {
		return command.elementIfExists('a', 'b').then(function (args) {
			assert.deepEqual(args, [ 'a', 'b' ]);
			return command.elementIfExists(new Error('Should resolve to undefined, not reject'));
		}).then(function (result) {
			assert.isUndefined(result);
		});
	}),
	'#hasElement': mockCommand(command, 'find', 'hasElement', function () {
		return command.hasElement('a', 'b').then(function (hasElement) {
			assert.isTrue(hasElement);
			assertWarn('Command#hasElement', 'Command#find');
			return command.hasElement(new Error('Should resolve to false, not reject'));
		}).then(function (hasElement) {
			assert.isFalse(hasElement);
		});
	}),
	'#active': deprecate('active', 'getActiveElement'),
	'#clickElement': deprecate('clickElement', 'click'),
	'#submit': deprecateElementSig('submit'),

	'#textPresent': (function () {
		let originalMethod;
		return {
			setup: function () {
				originalMethod = command.getVisibleText;
				command.getVisibleText = function () {
					return new Command(this, function () {
						return Promise.resolve('foo');
					});
				};
			},
			teardown: function () {
				command.getVisibleText = originalMethod;
			},
			'pass-through': function () {
				return command.textPresent('foo').then(function (result) {
					assert.isTrue(result);
					assertWarn('Command#textPresent', 'Command#getVisibleText');
					return command.textPresent('bar');
				}).then(function (result) {
					assert.isFalse(result);
				});
			},
			'with element': function () {
				let element = {
					getVisibleText: function () {
						return Promise.resolve('baz');
					}
				};

				return command.textPresent('foo', element).then(function (result) {
					assert.isFalse(result);
					return command.textPresent('baz', element);
				}).then(function (result) {
					assert.isTrue(result);
				});
			}
		};
	})(),

	'#type': deprecateElementSig('type'),
	'#keys': deprecate('keys', 'pressKeys'),
	'#getTagName': deprecateElementSig('getTagName'),
	'#clear': deprecateElementAndStandardSig('clear', 'clearValue'),
	'#isSelected': deprecateElementSig('isSelected'),
	'#isEnabled': deprecateElementSig('isEnabled'),
	'#enabled': deprecateElementAndStandardSig('enabled', 'isEnabled'),
	'#getAttribute': deprecateElementSig('getAttribute'),
	'#getValue': mockCommand(command, 'getProperty', 'deprecate', function () {
		return command.getValue().then(function (args) {
			assert.deepEqual(args, [ 'value' ]);
			assertWarn('Command#getValue', 'Command#getProperty(\'value\')');

			let element = {
				elementId: 'test',
				getProperty: function () {
					return Promise.resolve(Array.prototype.slice.call(arguments, 0).concat('fromElement'));
				}
			};

			return command.getValue(element).then(function (args) {
				assert.deepEqual(args, [ 'value', 'fromElement' ]);
				assertWarn('Command#getValue(element)', 'Command#getProperty(\'value\')');
			});
		});
	}),
	'#equalsElement': mockCommand(command, 'equals', 'deprecate', function () {
		let otherElement = {
			elementId: 'other'
		};

		return command.equalsElement(otherElement).then(function (args) {
			assert.deepEqual(args, [ otherElement ]);
			assertWarn('Command#equalsElement', 'Command#equals');

			let element = {
				elementId: 'test',
				equals: function (other) {
					return Promise.resolve([ other, 'fromElement' ]);
				}
			};

			return command.equalsElement(element, otherElement).then(function (args) {
				assert.deepEqual(args, [ otherElement, 'fromElement' ]);
				assertWarn('Command#equalsElement', 'element.equals(other)');
			});
		});
	}),
	'#isDisplayed': deprecateElementSig('isDisplayed'),
	'#displayed': deprecateElementAndStandardSig('displayed', 'isDisplayed'),
	'#getLocation': deprecateElementAndStandardSig('getLocation', 'getPosition'),
	'#getLocationInView': mockCommand(command, 'getPosition', 'deprecate', function () {
		return command.getLocationInView('a', 'b').then(function (args) {
			assert.deepEqual(args, [ 'a', 'b' ]);
			assertWarn('Command#getLocationInView', 'Command#getPosition');
		});
	}),
	'#getSize': deprecateElementSig('getSize'),
	'#getComputedCss': deprecateElementAndStandardSig('getComputedCss', 'getComputedStyle'),
	'#getComputedCSS': deprecateElementAndStandardSig('getComputedCSS', 'getComputedStyle'),
	'#alertText': deprecate('alertText', 'getAlertText'),
	'#alertKeys': deprecate('alertKeys', 'typeInPrompt'),
	'#moveTo': deprecateElementAndStandardSig('moveTo', 'moveMouseTo'),
	'#click(button)': mockCommand(command, 'clickMouseButton', 'deprecate signature', function () {
		return command.click(0).then(function (args) {
			assert.deepEqual(args, [ 0 ]);
			assertWarn('Command#click(button)', 'Command#clickMouseButton(button)');
		});
	}),
	'#click': mockCommand(Command.prototype, 'click', 'pass-through', function () {
		return command.click().then(function (args) {
			assert.deepEqual(args, []);
			assert.isNull(lastWarning);
		});
	}),
	'#buttonDown': deprecate('buttonDown', 'pressMouseButton'),
	'#buttonUp': deprecate('buttonUp', 'releaseMouseButton'),
	'#doubleclick': deprecate('doubleclick', 'doubleClick'),
	'#tapElement': deprecateElementSig('tapElement', 'tap'),
	'#flick': deprecate('flick', 'flickFinger'),
	'#setLocalStorageKey': deprecate('setLocalStorageKey', 'setLocalStorageItem'),
	'#getLocalStorageKey': deprecate('getLocalStorageKey', 'getLocalStorageItem'),
	'#removeLocalStorageKey': deprecate('removeLocalStorageKey', 'deleteLocalStorageItem'),
	'#log': deprecate('log', 'getLogsFor'),
	'#logTypes': deprecate('logTypes', 'getAvailableLogTypes'),
	'#newWindow': mockCommand(command, 'execute', 'deprecate', function () {
		return command.newWindow('a', 'b').then(function (args) {
			assert.deepEqual(args, [ 'window.open(arguments[0], arguments[1]);', [ 'a', 'b' ] ]);
			assertWarn('Command#newWindow', 'Command#execute');
		});
	}),
	'#windowName': mockCommand(command, 'execute', 'deprecate', function () {
		return command.windowName().then(function (args) {
			assert.deepEqual(args, [ 'return window.name;' ]);
			assertWarn('Command#windowName', 'Command#execute');
		});
	}),
	'#setHTTPInactivityTimeout': function () {
		let inactivityCommand = command.setHTTPInactivityTimeout();
		return inactivityCommand.then(function () {
			assert.strictEqual(inactivityCommand, command);
			assertWarn('Command#setHTTPInactivityTimeout');
		});
	},
	'#getPageIndex': function () {
		let args;
		return command.getPageIndex({
			elementId: 'test',
			_get: function () {
				args = Array.prototype.slice.call(arguments, 0);
				return Promise.resolve('1');
			}
		}).then(function (result) {
			assert.strictEqual(result, '1');
			assertWarn('Command#getPageIndex');
			assert.deepEqual(args, [ 'pageIndex' ]);
		});
	},
	'#uploadFile': function () {
		let uploadCommand = command.uploadFile();
		return uploadCommand.then(function () {
			assert.strictEqual(uploadCommand, command);
			assertWarn('Command#uploadFile', 'Command#type');
		});
	},
	'#waitForCondition': mockCommand(command.session, 'executeAsync', 'deprecate', function () {
		return command.waitForCondition('true', 1, 2).then(function (args) {
			assert.isArray(args);
			assert.isFunction(args[0]);
			assert.deepEqual(args[1], [ 'return eval(arguments[0]) ? true : null;', [ 'true' ], 1, 2 ]);
			assertWarn('Command#waitForCondition', 'Command#executeAsync');
			assertWarn('Command#waitForCondition', 'leadfoot/helpers/pollUntil');

			return command.waitForCondition('true').then(function (args) {
				assert.isArray(args);
				assert.isFunction(args[0]);
				assert.deepEqual(args[1], [ 'return eval(arguments[0]) ? true : null;', [ 'true' ], 1000, 100 ]);
			});
		});
	}),
	'#waitForConditionInBrowser': mockCommand(command.session, 'executeAsync', 'deprecate', function () {
		return command.waitForConditionInBrowser('true', 1000, 500).then(function (args) {
			assert.isArray(args);
			assert.isFunction(args[0]);
			assert.deepEqual(args[1], [ 'return eval(arguments[0]) ? true : null;', [ 'true' ], 1000, 500 ]);
			assertWarn('Command#waitForConditionInBrowser', 'Command#executeAsync');
			assertWarn('Command#waitForConditionInBrowser', 'leadfoot/helpers/pollUntil');

			return command.waitForConditionInBrowser('true').then(function (args) {
				assert.isArray(args);
				assert.isFunction(args[0]);
				assert.deepEqual(args[1], [ 'return eval(arguments[0]) ? true : null;', [ 'true' ], 1000, 100 ]);
			});
		});
	}),
	'#sauceJobUpdate': function () {
		let updateCommand = command.sauceJobUpdate();
		return updateCommand.then(function () {
			assert.strictEqual(updateCommand, command);
			assertWarn('Command#sauceJobUpdate');
		});
	},
	'#sauceJobStatus': function () {
		let updateCommand = command.sauceJobStatus();
		return updateCommand.then(function () {
			assert.strictEqual(updateCommand, command);
			assertWarn('Command#sauceJobStatus');
		});
	},
	'#wait': deprecate('wait', 'sleep'),
	'#reset': function () {
		let resetCommand = command.reset();
		return resetCommand.then(function () {
			assert.strictEqual(resetCommand, command);
			assertWarn('Command#reset');
		});
	}
};

suffixes.forEach(function (suffix, index) {
	function addStrategy(method, toMethod, suffix, wdSuffix, using) {
		suite['#' + method + 'OrNull'] = mockCommand(command, 'elementOrNull', 'deprecate', function () {
			return command[method + 'OrNull']('a').then(function (args) {
				assert.deepEqual(args, [ using, 'a' ]);
			});
		});

		suite['#' + method + 'IfExists'] = mockCommand(command, 'elementIfExists', 'deprecate', function () {
			return command[method + 'IfExists']('a').then(function (args) {
				assert.deepEqual(args, [ using, 'a' ]);
			});
		});

		suite['#hasElementBy' + wdSuffix] = mockCommand(command, 'hasElement', 'deprecate', function () {
			return command['hasElementBy' + wdSuffix]('a').then(function (args) {
				assert.deepEqual(args, [ using, 'a' ]);
			});
		});

		suite['#waitForElementBy' + wdSuffix] = mockCommand(command, 'waitForElement', 'deprecate', function () {
			return command['waitForElementBy' + wdSuffix]('a', 123).then(function (args) {
				assert.deepEqual(args, [ using, 'a', 123 ]);
			});
		});

		suite['#waitForVisibleBy' + wdSuffix] = mockCommand(command, 'waitForVisible', 'deprecate', function () {
			return command['waitForVisibleBy' + wdSuffix]('a', 123).then(function (args) {
				assert.deepEqual(args, [ using, 'a', 123 ]);
			});
		});
	}

	let wdSuffix = suffix === 'Xpath' ? 'XPath' : suffix;
	let method = 'elementBy' + wdSuffix;
	let toMethod = 'findBy' + suffix;
	let using = Strategies.prototype[index];
	addStrategy(method, toMethod, suffix, wdSuffix, using);
	if (suffix === 'CssSelector') {
		addStrategy('elementByCss', toMethod, suffix, 'Css', using);
	}
});

registerSuite(suite);
