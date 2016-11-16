/**
 * The compat module adds support for Intern 1.x functional testing APIs based on WD.js 0.2.2 to Leadfoot.
 *
 * @deprecated Use the standard Leadfoot APIs.
 * @module leadfoot/compat
 */

import Command from './Command';
import Element from './Element';
import Promise = require('dojo/Promise');
import pollUntil = require('./helpers/pollUntil');
import strategies, { suffixes } from './lib/strategies';
import * as topic from 'dojo/topic';

/**
 * Warns a user once that the method given by `name` is deprecated.
 *
 * @private
 * @method
 * @param {string} name The name of the old method.
 * @param {string=} replacement Replacement instructions, if a direct replacement for the old method exists.
 * @param {string=} extra Extra information about the deprecation.
 */
const warn = (function () {
	const warned: { [key: string]: boolean; } = {};
	return function (name: string, replacement?: string, extra?: string) {
		if (warned[name]) {
			return;
		}

		warned[name] = true;
		topic.publish('/deprecated', name, replacement, extra);
	};
})();

/**
 * Deprecates `fromMethod` for `toMethod` and returns the correct call to `toMethod`.
 *
 * @private
 * @param {string} fromMethod
 * @param {string} toMethod
 * @returns {Function}
 */
function deprecate(fromMethod: string, toMethod: string): Function {
	return function (this: any) {
		warn('Command#' + fromMethod, 'Command#' + toMethod);
		return this[toMethod].apply(this, arguments);
	};
}

/**
 * Deprecates the element context signature of a method and returns a new command with the correct call to
 * `toMethod` on the element.
 *
 * @private
 * @param {string} fromMethod
 * The name of the old method.
 *
 * @param {string=} toMethod
 * The name of the replacement method on the element, if it is different than the name of the old method. If
 * omitted, it is assumed that the method name
 *
 * @param {Function=} fn
 * An optional function that will be invoked in lieu of a call to the original method if a non-element signature
 * is used.
 *
 * @returns {Function}
 */
function deprecateElementSig(fromMethod: string, toMethod?: string, fn?: Function): Function {
	return function (this: any, element?: Element, ...args: any[]) {
		if (element && element.elementId) {
			warn('Command#' + fromMethod + '(element)', 'Command#find then Command#' + fromMethod + ', or ' +
				'Command#find then Command#then(function (element) { return element.' +
				(toMethod || fromMethod) + '(); }');

			return new this.constructor(this, function (this: Element) {
				return (<any> element)[toMethod || fromMethod].apply(this, args);
			});
		}

		return fn ? fn.apply(this, arguments) : Command.prototype[fromMethod].apply(this, arguments);
	};
}

/**
 * Deprecates the element context signature of a method as well as its non-element signature to go to `toMethod`.
 *
 * @private
 * @param {string} fromMethod
 * @param {string} toMethod
 * @returns {Function}
 */
function deprecateElementAndStandardSig(fromMethod, toMethod) {
	return deprecateElementSig(fromMethod, toMethod, deprecate(fromMethod, toMethod));
}

const methods = {
	get sessionID() {
		warn('Command#sessionID', 'the Command#session.sessionId property');
		return this.session.sessionId;
	},
	status() {
		warn('Command#status');
		return new this.constructor(this, function () {
			return this.session.server.getStatus();
		});
	},
	init() {
		warn('Command#init');
		return this;
	},
	sessions() {
		warn('Command#sessions');
		return new this.constructor(this, function () {
			return this.session.server.getSessions();
		});
	},
	sessionCapabilities() {
		warn('Command#sessionCapabilities', 'the Command#session.capabilities property');
		return new this.constructor(this, function () {
			return this.session.capabilities;
		});
	},
	altSessionCapabilities() {
		warn('Command#altSessionCapabilities', 'the Command#session.capabilities property');
		return new this.constructor(this, function () {
			return this.session.capabilities;
		});
	},
	getSessionId() {
		warn('Command#getSessionId', 'the Command#session.sessionId property');
		return new this.constructor(this, function () {
			return this.session.sessionId;
		});
	},
	getSessionID() {
		warn('Command#getSessionID', 'the Command#session.sessionId property');
		return new this.constructor(this, function () {
			return this.session.sessionId;
		});
	},
	setAsyncScriptTimeout: deprecate('setAsyncScriptTimeout', 'setExecuteAsyncTimeout'),
	setWaitTimeout: deprecate('setWaitTimeout', 'setFindTimeout'),
	setImplicitWaitTimeout: deprecate('setImplicitWaitTimeout', 'setFindTimeout'),
	windowHandle: deprecate('windowHandle', 'getCurrentWindowHandle'),
	windowHandles: deprecate('windowHandles', 'getAllWindowHandles'),
	url: deprecate('url', 'getCurrentUrl'),
	forward: deprecate('forward', 'goForward'),
	back: deprecate('back', 'goBack'),
	safeExecute: deprecate('safeExecute', 'execute'),
	eval(code) {
		warn('Command#eval', 'Command#execute with a return call');
		return this.execute('return eval(arguments[0]);', [ code ]);
	},
	safeEval(code) {
		warn('Command#safeEval', 'Command#execute with a return call');
		return this.execute('return eval(arguments[0]);', [ code ]);
	},
	safeExecuteAsync: deprecate('safeExecuteAsync', 'executeAsync'),
	frame: deprecate('frame', 'switchToFrame'),
	window: deprecate('window', 'switchToWindow'),
	close: deprecate('close', 'closeCurrentWindow'),
	windowSize: deprecate('windowSize', 'setWindowSize'),
	setWindowSize(...args: any[]) {
		if (args.length === 3 && typeof args[0] === 'number') {
			warn('Command#setWindowSize(width, height, handle)',
				'Command#setWindowSize(handle, width, height)');
			args.unshift(args.pop());
		}

		return Command.prototype.setWindowSize.apply(this, args);
	},
	setWindowPosition(...args: any[]) {
		if (args.length === 3 && typeof args[0] === 'number') {
			warn('Command#setWindowPosition(x, y, handle)',
				'Command#setWindowPosition(handle, x, y)');
			args.unshift(args.pop());
		}

		return Command.prototype.setWindowPosition.apply(this, args);
	},
	maximize: deprecate('maximize', 'maximizeWindow'),
	allCookies: deprecate('allCookies', 'getCookies'),
	deleteAllCookies: deprecate('deleteAllCookies', 'clearCookies'),
	source: deprecate('source', 'getPageSource'),
	title: deprecate('title', 'getPageTitle'),
	element: deprecate('element', 'find'),
	elementByClassName: deprecate('elementByClassName', 'findByClassName'),
	elementByCssSelector: deprecate('elementByCssSelector', 'findByCssSelector'),
	elementById: deprecate('elementById', 'findById'),
	elementByName: deprecate('elementByName', 'findByName'),
	elementByLinkText: deprecate('elementByLinkText', 'findByLinkText'),
	elementByPartialLinkText: deprecate('elementByPartialLinkText', 'findByPartialLinkText'),
	elementByTagName: deprecate('elementByTagName', 'findByTagName'),
	elementByXPath: deprecate('elementByXPath', 'findByXpath'),
	elementByCss: deprecate('elementByCss', 'findByCssSelector'),
	elements: deprecate('elements', 'findAll'),
	elementsByClassName: deprecate('elementsByClassName', 'findAllByClassName'),
	elementsByCssSelector: deprecate('elementsByCssSelector', 'findAllByCssSelector'),
	elementsById(value) {
		warn('Command#elementsById', 'Command#findById');
		return this.findAll('id', value);
	},
	elementsByName: deprecate('elementsByName', 'findAllByName'),
	elementsByLinkText: deprecate('elementsByLinkText', 'findAllByLinkText'),
	elementsByPartialLinkText: deprecate('elementsByPartialLinkText', 'findAllByPartialLinkText'),
	elementsByTagName: deprecate('elementsByTagName', 'findAllByTagName'),
	elementsByXPath: deprecate('elementsByXPath', 'findAllByXpath'),
	elementsByCss: deprecate('elementsByCss', 'findAllByCssSelector'),
	elementOrNull(using, value) {
		warn('Command#elementOrNull', 'Command#find and Command#finally, or Command#findAll');
		return this.find(using, value).catch(function () {
			return null;
		});
	},
	elementIfExists(using, value) {
		warn('Command#elementIfExists', 'Command#find and Command#finally, or Command#findAll');
		return this.find(using, value).catch(function () {});
	},
	hasElement(using, value) {
		warn('Command#hasElement', 'Command#find and Command#then(exists, doesNotExist)');
		return this.find(using, value).then(function () {
			return true;
		}, function () {
			return false;
		});
	},
	active: deprecate('active', 'getActiveElement'),
	clickElement: deprecateElementAndStandardSig('clickElement', 'click'),
	submit: deprecateElementSig('submit'),
	text(element) {
		return new this.constructor(this, function () {
			if ((!element || element === 'body') && !this.context.length) {
				if (element === 'body') {
					warn('Command#text(\'body\')', 'Command#findByTagName(\'body\') then Command#getVisibleText');
				}
				else {
					warn('Command#text with no element', 'Command#findByTagName(\'body\') then Command#getVisibleText');
				}

				return this.session.findByTagName('body').then(function (body) {
					return body.getVisibleText();
				});
			}
			else if (element && element.elementId) {
				warn('Command#text(element)', 'Command#find then Command#getVisibleText, or ' +
					'Command#find then Command#then(function (element) { return element.getVisibleText(); }');
				return element.getVisibleText();
			}
			else {
				warn('Command#text', 'Command#getVisibleText');
				if (this.context.isSingle) {
					return this.context[0].getVisibleText();
				}
				else {
					return Promise.all(this.context.map(function (element) {
						return element.getVisibleText();
					}));
				}
			}
		});
	},

	// This method had a two-argument version according to the WD.js docs but they inexplicably swapped the first
	// and second arguments so it probably never would have worked properly in Intern
	textPresent(searchText, element) {
		warn('Command#textPresent', 'Command#getVisibleText and a promise helper');

		function test(text) {
			return text.indexOf(searchText) > -1;
		}

		if (element) {
			return new this.constructor(this, function () {
				return element.getVisibleText().then(test);
			});
		}

		return this.getVisibleText().then(test);
	},

	type: deprecateElementSig('type'),
	keys: deprecate('keys', 'pressKeys'),
	getTagName: deprecateElementSig('getTagName'),
	clear: deprecateElementAndStandardSig('clear', 'clearValue'),
	isSelected: deprecateElementSig('isSelected'),
	isEnabled: deprecateElementSig('isEnabled'),
	enabled: deprecateElementAndStandardSig('enabled', 'isEnabled'),
	getAttribute: deprecateElementSig('getAttribute'),
	getValue(element) {
		if (element && element.elementId) {
			warn('Command#getValue(element)', 'Command#find then Command#getProperty(\'value\'), or ' +
				'Command#find then Command#then(function (element) { ' +
				'return element.getProperty(\'value\'); }');

			return new this.constructor(this, function () {
				return element.getProperty('value');
			});
		}

		warn('Command#getValue', 'Command#find then Command#getProperty(\'value\')');
		return this.getProperty('value');
	},
	equalsElement(element, other) {
		if (other && other.elementId) {
			warn('Command#equalsElement(element, other)', 'element.equals(other)');
			return new this.constructor(this, function () {
				return element.equals(other);
			});
		}

		warn('Command#equalsElement', 'Command#equals');
		return this.equals(element);
	},
	isDisplayed: deprecateElementSig('isDisplayed'),
	displayed: deprecateElementAndStandardSig('displayed', 'isDisplayed'),
	getLocation: deprecateElementAndStandardSig('getLocation', 'getPosition'),
	getLocationInView() {
		warn(
			'Command#getLocationInView',
			'Command#getPosition',
			'This command is defined in the spec as internal and should never have been exposed to end users. ' +
			'The returned value of this command will be the same as Command#getPosition, which may not match ' +
			'prior behaviour.'
		);

		return this.getPosition.apply(this, arguments);
	},
	getSize: deprecateElementSig('getSize'),
	getComputedCss: deprecateElementAndStandardSig('getComputedCss', 'getComputedStyle'),
	getComputedCSS: deprecateElementAndStandardSig('getComputedCSS', 'getComputedStyle'),
	alertText: deprecate('alertText', 'getAlertText'),
	alertKeys: deprecate('alertKeys', 'typeInPrompt'),
	moveTo: deprecateElementAndStandardSig('moveTo', 'moveMouseTo'),
	click(button) {
		if (typeof button === 'number') {
			warn('Command#click(button)', 'Command#clickMouseButton(button)');
			return this.clickMouseButton(button);
		}

		return Command.prototype.click.apply(this, arguments);
	},
	buttonDown: deprecate('buttonDown', 'pressMouseButton'),
	buttonUp: deprecate('buttonUp', 'releaseMouseButton'),
	doubleclick: deprecate('doubleclick', 'doubleClick'),
	// TODO: There is no tap on elements
	tapElement: deprecateElementSig('tapElement', 'tap'),
	// TODO: There is no flick on elements
	flick: deprecate('flick', 'flickFinger'),
	setLocalStorageKey: deprecate('setLocalStorageKey', 'setLocalStorageItem'),
	getLocalStorageKey: deprecate('getLocalStorageKey', 'getLocalStorageItem'),
	removeLocalStorageKey: deprecate('removeLocalStorageKey', 'deleteLocalStorageItem'),
	log: deprecate('log', 'getLogsFor'),
	logTypes: deprecate('logTypes', 'getAvailableLogTypes'),
	newWindow(url, name) {
		warn('Command#newWindow', 'Command#execute');
		return this.execute('window.open(arguments[0], arguments[1]);', [ url, name ]);
	},
	windowName() {
		warn('Command#windowName', 'Command#execute');
		return this.execute('return window.name;');
	},
	setHTTPInactivityTimeout() {
		warn('Command#setHTTPInactivityTimeout');
		return this;
	},
	getPageIndex(element) {
		warn('Command#getPageIndex', null, 'This command is not part of any specification.');
		if (element && element.elementId) {
			return new this.constructor(this, function () {
				return element._get('pageIndex');
			});
		}

		return new this.constructor(this, function () {
			if (this.context.isSingle) {
				return this.context[0]._get('pageIndex');
			}
			else {
				return Promise.all(this.context.map(function (element) {
					return element._get('pageIndex');
				}));
			}
		});
	},
	uploadFile() {
		warn(
			'Command#uploadFile',
			'Command#type to type a file path into a file upload form control',
			'This command is not part of any specification. This command is a no-op.'
		);

		return this;
	},
	waitForCondition(expression, timeout, pollInterval) {
		timeout = timeout || 1000;
		pollInterval = pollInterval || 100;

		warn('Command#waitForCondition', 'Command#executeAsync or leadfoot/helpers/pollUntil');

		return this.then(pollUntil('return eval(arguments[0]) ? true : null;', [ expression ], timeout, pollInterval));
	},
	waitForConditionInBrowser(expression, timeout, pollInterval) {
		timeout = timeout || 1000;
		pollInterval = pollInterval || 100;

		warn('Command#waitForConditionInBrowser', 'Command#executeAsync or leadfoot/helpers/pollUntil');

		return this.then(pollUntil('return eval(arguments[0]) ? true : null;', [ expression ], timeout, pollInterval));
	},
	sauceJobUpdate() {
		warn(
			'Command#sauceJobUpdate',
			null,
			'This command is not part of any specification. This command is a no-op.'
		);

		return this;
	},
	sauceJobStatus() {
		warn(
			'Command#sauceJobStatus',
			null,
			'This command is not part of any specification. This command is a no-op.'
		);

		return this;
	},
	reset() {
		warn(
			'Command#reset',
			'a previously stored Command instance'
		);

		return this;
	},
	waitForElement(this: Command, using, value, timeout) {
		warn(
			'Command#waitForElement',
			'Command#setFindTimeout and Command#find',
			'This command is implemented using implicit timeouts, which may not match the prior behaviour.'
		);

		// This is effectively what the WD.js code does, though there it's because the property is never validated,
		// so the end date becomes NaN; not an intentional design choice
		if (typeof timeout === 'undefined') {
			timeout = Infinity;
		}

		const command = this;
		return this.getFindTimeout().then(function (originalTimeout) {
			return command.setFindTimeout(timeout)
				.find(using, value)
				.then(function () {
					return command.setFindTimeout(originalTimeout).then(function () {
						return null;
					});
				}, function (error) {
					return command.setFindTimeout(originalTimeout).then(function () {
						throw error;
					});
				});
		});
	},
	waitForVisible(this: Command, using, value, timeout) {
		warn(
			'Command#waitForVisible',
			null,
			'This command is partially implemented using implicit timeouts, which may not match the prior ' +
			'behaviour.'
		);

		// This is effectively what the WD.js code does, though there it's because the property is never validated,
		// so the end date becomes NaN; not an intentional design choice
		if (typeof timeout === 'undefined') {
			timeout = Infinity;
		}

		const startTime = Date.now();
		const command = this;
		return this.getFindTimeout().then(function (originalTimeout) {
			return command.setFindTimeout(timeout)
				.find(using, value)
				.then(function (element) {
					return pollUntil(/* istanbul ignore next */ function (element) {
						return element.offsetWidth && element.offsetHeight ? true : null;
					}, [ element ], timeout - (startTime - Date.now())).call(this);
				}).then(function (isVisible) {
					return command.setFindTimeout(originalTimeout).then(function () {
						if (!isVisible) {
							throw new Error('Element didn\'t become visible');
						}
					});
				}, function (error) {
					return command.setFindTimeout(originalTimeout).then(function () {
						throw error;
					});
				});
		});
	},
	isVisible(...args: any[]) {
		warn(
			'Command#isVisible',
			'Command#isDisplayed',
			'This command is implemented using Command#isDisplayed, which may not match the prior behaviour.'
		);

		if (arguments.length === 2) {
			const using = args[0];
			const value = args[1];
			return this.find(using, value).isDisplayed().catch(function () {
				return false;
			});
		}
		else if (arguments.length === 1) {
			const element = args[0];
			if (element && element.elementId) {
				return new this.constructor(this, function () {
					return element.isDisplayed();
				});
			}
		}

		return new this.constructor(this, function () {
			if (this.context.isSingle) {
				return this.context[0].isDisplayed();
			}
			else {
				return Promise.all(this.context.map(function (element) {
					return element.isDisplayed();
				}));
			}
		});
	},
	otherwise: deprecate('otherwise', 'catch'),
	always: deprecate('always', 'finally'),
	wait: deprecate('wait', 'sleep')
};

suffixes.forEach(function (suffix, index) {
	function addStrategy(method, toMethod, suffix, wdSuffix, using) {
		methods[method + 'OrNull'] = function (value) {
			return this.elementOrNull(using, value);
		};

		methods[method + 'IfExists'] = function (value) {
			return this.elementIfExists(using, value);
		};

		methods['hasElementBy' + wdSuffix] = function (value) {
			return this.hasElement(using, value);
		};

		methods['waitForElementBy' + wdSuffix] = function (value, timeout) {
			return this.waitForElement(using, value, timeout);
		};

		methods['waitForVisibleBy' + wdSuffix] = function (value, timeout) {
			return this.waitForVisible(using, value, timeout);
		};
	}

	const wdSuffix = suffix === 'Xpath' ? 'XPath' : suffix;
	const method = 'elementBy' + wdSuffix;
	const toMethod = 'findBy' + suffix;
	const using = strategies[index];
	addStrategy(method, toMethod, suffix, wdSuffix, using);
	if (suffix === 'CssSelector') {
		addStrategy('elementByCss', toMethod, suffix, 'Css', using);
	}
});

module.exports = {
	/**
	 * Applies the methods from compat to a {@link module:leadfoot/Command} prototype or instance.
	 *
	 * @param {module:leadfoot/Command} prototype A {@link module:leadfoot/Command} prototype or instance.
	 */
	applyTo(prototype) {
		for (let key in methods) {
			Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(methods, key));
		}
	}
};
