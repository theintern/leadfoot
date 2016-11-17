/* global window:false */

/**
 * @module leadfoot/Element
 */

import FindDisplayed from './lib/findDisplayed';
import * as fs from 'dojo/node!fs';
import  Strategies from './lib/strategies';
import WaitForDeleted from './lib/waitForDeleted';
import * as util from './lib/util';
import Promise = require('dojo/Promise');
import Session from './Session';

function noop() {
	// At least ios-driver 0.6.6 returns an empty object for methods that are supposed to return no value at all,
	// which is not correct
}

/**
 * An Element represents a DOM or UI element within the remote environment.
 *
 * @constructor module:leadfoot/Element
 *
 * @param {string|module:leadfoot/Element|{ ELEMENT: string }} elementId
 * The ID of the element, as provided by the remote.
 *
 * @param {module:leadfoot/Session} session
 * The session that the element belongs to.
 */
export type ElementOrElementId = { ELEMENT: string; } | Element | string;

export default class Element implements WaitForDeleted, FindDisplayed, Strategies {
	private _elementId: string;
	private _session: Session;
	constructor(elementId: /*ElementOrElementId*/any, session: Session) {
		this._elementId = elementId.ELEMENT || elementId.elementId || elementId;
		this._session = session;
	}

	/**
	 * The opaque, remote-provided ID of the element.
	 *
	 * @member {string} elementId
	 * @memberOf module:leadfoot/Element#
	 * @readonly
	 */
	get elementId() {
		return this._elementId;
	}

	/**
	 * The session that the element belongs to.
	 *
	 * @member {module:leadfoot/Session} session
	 * @memberOf module:leadfoot/Element#
	 * @readonly
	 */
	get session() {
		return this._session;
	}

	private _get(path: string, requestData?: any, pathParts?: any): Promise<any> {
		path = 'element/' + encodeURIComponent(this._elementId) + '/' + path;
		return this._session['_get'](path, requestData, pathParts);
	}

	private _post(path: string, requestData?: any, pathParts?: any): Promise<any> {
		path = 'element/' + encodeURIComponent(this._elementId) + '/' + path;
		return this._session['_post'](path, requestData, pathParts);
	}

	toJSON() {
		return { ELEMENT: this._elementId };
	}

	/**
	 * Gets the first element within this element that matches the given query.
	 *
	 * @see {@link module:leadfoot/Session#setFindTimeout} to set the amount of time it the remote environment
	 * should spend waiting for an element that does not exist at the time of the `find` call before timing
	 * out.
	 *
	 * @param {string} using
	 * The element retrieval strategy to use. See {@link module:leadfoot/Session#find} for options.
	 *
	 * @param {string} value
	 * The strategy-specific value to search for. See {@link module:leadfoot/Session#find} for details.
	 *
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	find(using: string, value: string): Promise<Element> {
		const session = this._session;

		if (using.indexOf('link text') !== -1 && this.session.capabilities.brokenWhitespaceNormalization) {
			return this.session.execute(/* istanbul ignore next */ this.session._manualFindByLinkText, [
				using, value, false, this
			]).then(function (element: ElementOrElementId) {
				if (!element) {
					const error = new Error();
					error.name = 'NoSuchElement';
					throw error;
				}
				return new Element(element, session);
			});
		}

		return this._post('element', {
			using: using,
			value: value
		}).then(function (element) {
			return new Element(element, session);
		});
	}

	/**
	 * Gets all elements within this element that match the given query.
	 *
	 * @param {string} using
	 * The element retrieval strategy to use. See {@link module:leadfoot/Session#find} for options.
	 *
	 * @param {string} value
	 * The strategy-specific value to search for. See {@link module:leadfoot/Session#find} for details.
	 *
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAll(using: string, value: string): Promise<Element[]> {
		const session = this._session;

		if (using.indexOf('link text') !== -1 && this.session.capabilities.brokenWhitespaceNormalization) {
			return this.session.execute(/* istanbul ignore next */ this.session._manualFindByLinkText, [
				using, value, true, this
			]).then(function (elements: ElementOrElementId[]) {
				return elements.map(function (element) {
					return new Element(element, session);
				});
			});
		}

		return this._post('elements', {
			using: using,
			value: value
		}).then(function (elements: ElementOrElementId[]) {
			return elements.map(function (element) {
				return new Element(element, session);
			});
		});
	}

	/**
	 * Clicks the element. This method works on both mouse and touch platforms.
	 *
	 * @returns {Promise.<void>}
	 */
	click(): Promise<void> {
		return this._post('click').then(() => {
			// ios-driver 0.6.6-SNAPSHOT April 2014 and MS Edge Driver 14316 do not wait until the default action for
			// a click event occurs before returning
			if (this.session.capabilities.touchEnabled || this.session.capabilities.returnsFromClickImmediately) {
				return util.sleep(500);
			}
		});
	}

	/**
	 * Submits the element, if it is a form, or the form belonging to the element, if it is a form element.
	 *
	 * @returns {Promise.<void>}
	 */
	submit(): Promise<void> {
		if (this.session.capabilities.brokenSubmitElement) {
			return this.session.execute(/* istanbul ignore next */ function (element: any) {
				if (element.submit) {
					element.submit();
				}
				else if (element.type === 'submit' && element.click) {
					element.click();
				}
			}, [ this ]);
		}

		return this._post('submit').then(noop);
	}

	/**
	 * Gets the visible text within the element. `<br>` elements are converted to line breaks in the returned
	 * text, and whitespace is normalised per the usual XML/HTML whitespace normalisation rules.
	 *
	 * @returns {Promise.<string>}
	 */
	getVisibleText(): Promise<string> {
		const result = this._get('text');

		if (this.session.capabilities.brokenWhitespaceNormalization) {
			return result.then(text => this.session._normalizeWhitespace(text));
		}

		return result;
	}

	/**
	 * Types into the element. This method works the same as the {@link module:leadfoot/Session#pressKeys} method
	 * except that any modifier keys are automatically released at the end of the command. This method should be used
	 * instead of {@link module:leadfoot/Session#pressKeys} to type filenames into file upload fields.
	 *
	 * Since 1.5, if the WebDriver server supports remote file uploads, and you type a path to a file on your local
	 * computer, that file will be transparently uploaded to the remote server and the remote filename will be typed
	 * instead. If you do not want to upload local files, use {@link module:leadfoot/Session#pressKeys} instead.
	 *
	 * @param {string|string[]} value
	 * The text to type in the remote environment. See {@link module:leadfoot/Session#pressKeys} for more information.
	 *
	 * @returns {Promise.<void>}
	 */
	type(value: string|string[]): Promise<void> {
		if (!Array.isArray(value)) {
			value = [ value ];
		}

		if (this.session.capabilities.remoteFiles) {
			const filename = value.join('');

			// Check to see if the input is a filename; if so, upload the file and then post it's remote name into the
			// field
			try {
				if (fs.statSync(filename).isFile()) {
					return this.session._uploadFile(filename).then((uploadedFilename: string) => {
						return this._post('value', {
							value: [ uploadedFilename ]
						}).then(noop);
					});
				}
			}
			catch (error) {
				// ignore
			}
		}

		// If the input isn't a filename, just post the value directly
		return this._post('value', {
			value: value
		}).then(noop);
	}

	/**
	 * Gets the tag name of the element. For HTML documents, the value is always lowercase.
	 *
	 * @returns {Promise.<string>}
	 */
	getTagName(): Promise<string> {
		return this._get('name').then((name: string) => {
			if (this.session.capabilities.brokenHtmlTagName) {
				return this.session.execute(
					'return document.body && document.body.tagName === document.body.tagName.toUpperCase();'
				).then(function (isHtml: boolean) {
					return isHtml ? name.toLowerCase() : name;
				});
			}

			return name;
		});
	}

	/**
	 * Clears the value of a form element.
	 *
	 * @returns {Promise.<void>}
	 */
	clearValue(): Promise<void> {
		return this._post('clear').then(noop);
	}

	/**
	 * Returns whether or not a form element is currently selected (for drop-down options and radio buttons), or
	 * whether or not the element is currently checked (for checkboxes).
	 *
	 * @returns {Promise.<boolean>}
	 */
	isSelected(): Promise<boolean> {
		return this._get('selected');
	}

	/**
	 * Returns whether or not a form element can be interacted with.
	 *
	 * @returns {Promise.<boolean>}
	 */
	isEnabled(): Promise<boolean> {
		return this._get('enabled');
	}

	/**
	 * Gets a property or attribute of the element according to the WebDriver specification algorithm. Use of this
	 * method is not recommended; instead, use {@link module:leadfoot/Element#getAttribute} to retrieve DOM attributes
	 * and {@link module:leadfoot/Element#getProperty} to retrieve DOM properties.
	 *
	 * This method uses the following algorithm on the server to determine what value to return:
	 *
	 * 1. If `name` is 'style', returns the `style.cssText` property of the element.
	 * 2. If the attribute exists and is a boolean attribute, returns 'true' if the attribute is true, or null
	 *    otherwise.
	 * 3. If the element is an `<option>` element and `name` is 'value', returns the `value` attribute if it exists,
	 *    otherwise returns the visible text content of the option.
	 * 4. If the element is a checkbox or radio button and `name` is 'selected', returns 'true' if the element is
	 *    checked, or null otherwise.
	 * 5. If the returned value is expected to be a URL (e.g. element is `<a>` and attribute is `href`), returns the
	 *    fully resolved URL from the `href`/`src` property of the element, not the attribute.
	 * 6. If `name` is 'class', returns the `className` property of the element.
	 * 7. If `name` is 'readonly', returns 'true' if the `readOnly` property is true, or null otherwise.
	 * 8. If `name` corresponds to a property of the element, and the property is not an Object, return the property
	 *    value coerced to a string.
	 * 9. If `name` corresponds to an attribute of the element, return the attribute value.
	 *
	 * @param {string} name The property or attribute name.
	 * @returns {Promise.<string>} The value of the attribute as a string, or `null` if no such property or
	 * attribute exists.
	 */
	getSpecAttribute(name: string): Promise<string> {
		return this._get('attribute/$0', null, [ name ]).then((value) => {
			if (this.session.capabilities.brokenNullGetSpecAttribute && (value === '' || value === undefined)) {
				return this.session.execute(/* istanbul ignore next */ function (element: HTMLElement, name: string) {
					return element.hasAttribute(name);
				}, [ this, name ]).then(function (hasAttribute: boolean) {
					return hasAttribute ? value : null;
				});
			}

			return value;
		}).then(function (value) {
			// At least ios-driver 0.6.6-SNAPSHOT violates draft spec and returns boolean attributes as
			// booleans instead of the string "true" or null
			if (typeof value === 'boolean') {
				value = value ? 'true' : null;
			}

			return value;
		});
	}

	/**
	 * Gets an attribute of the element.
	 *
	 * @see Element#getProperty to retrieve an element property.
	 * @param {string} name The name of the attribute.
	 * @returns {Promise.<string>} The value of the attribute, or `null` if no such attribute exists.
	 */
	getAttribute(name: string): Promise<string> {
		return this.session.execute('return arguments[0].getAttribute(arguments[1]);', [ this, name ]);
	}

	/**
	 * Gets a property of the element.
	 *
	 * @see Element#getAttribute to retrieve an element attribute.
	 * @param {string} name The name of the property.
	 * @returns {Promise.<any>} The value of the property.
	 */
	getProperty(name: string): Promise<any> {
		return this.session.execute('return arguments[0][arguments[1]];', [ this, name ]);
	}

	/**
	 * Determines if this element is equal to another element.
	 *
	 * @param {module:leadfoot/Element} other
	 * @returns {Promise.<boolean>}
	 */
	equals(other: Element): Promise<boolean> {
		const elementId = other.elementId || other;
		return this._get('equals/$0', null, [ elementId ]).catch((error) => {
			// At least Selendroid 0.9.0 does not support this command;
			// At least ios-driver 0.6.6-SNAPSHOT April 2014 fails
			if (error.name === 'UnknownCommand' ||
				(error.name === 'UnknownError' && error.message.indexOf('bug.For input string:') > -1)
			) {
				return this.session.execute('return arguments[0] === arguments[1];', [ this, other ]);
			}

			throw error;
		});
	}

	/**
	 * Returns whether or not the element would be visible to an actual user. This means that the following types
	 * of elements are considered to be not displayed:
	 *
	 * 1. Elements with `display: none`
	 * 2. Elements with `visibility: hidden`
	 * 3. Elements positioned outside of the viewport that cannot be scrolled into view
	 * 4. Elements with `opacity: 0`
	 * 5. Elements with no `offsetWidth` or `offsetHeight`
	 *
	 * @returns {Promise.<boolean>}
	 */
	isDisplayed(): Promise<boolean> {
		return this._get('displayed').then((isDisplayed: boolean) => {

			if (isDisplayed && (
				this.session.capabilities.brokenElementDisplayedOpacity ||
				this.session.capabilities.brokenElementDisplayedOffscreen
			)) {
				return this.session.execute(/* istanbul ignore next */ function (element: HTMLElement) {
					const scrollX = document.documentElement.scrollLeft || document.body.scrollLeft;
					const scrollY = document.documentElement.scrollTop || document.body.scrollTop;
					do {
						if (window.getComputedStyle(element, null).opacity === '0') {
							return false;
						}

						const bbox = element.getBoundingClientRect();
						if (bbox.right + scrollX <= 0 || bbox.bottom + scrollY <= 0) {
							return false;
						}
					}
					while ((element = <HTMLElement> element.parentNode) && element.nodeType === 1);
					return true;
				}, [ this ]);
			}

			return isDisplayed;
		});
	}

	/**
	 * Gets the position of the element relative to the top-left corner of the document, taking into account
	 * scrolling and CSS transformations (if they are supported).
	 *
	 * @returns {Promise.<{ x: number, y: number }>}
	 */
	getPosition(): Promise<{ x: number, y: number }> {
		if (this.session.capabilities.brokenElementPosition) {
			/* jshint browser:true */
			return this.session.execute(/* istanbul ignore next */ function (element: HTMLElement) {
				const bbox = element.getBoundingClientRect();
				const scrollX = document.documentElement.scrollLeft || document.body.scrollLeft;
				const scrollY = document.documentElement.scrollTop || document.body.scrollTop;

				return { x: scrollX + bbox.left, y: scrollY + bbox.top };
			}, [ this ]);
		}

		return this._get('location').then(function (position: { x: number, y: number }) {
			// At least FirefoxDriver 2.41.0 incorrectly returns an object with additional `class` and `hCode`
			// properties
			return { x: position.x, y: position.y };
		});
	}

	/**
	 * Gets the size of the element, taking into account CSS transformations (if they are supported).
	 *
	 * @returns {Promise.<{ width: number, height: number }>}
	 */
	getSize(): Promise<{ width: number, height: number }> {
		const getUsingExecute = () => {
			return this.session.execute(/* istanbul ignore next */ function (element: HTMLElement) {
				const bbox = element.getBoundingClientRect();
				return { width: bbox.right - bbox.left, height: bbox.bottom - bbox.top };
			}, [ this ]);
		};

		if (this.session.capabilities.brokenCssTransformedSize) {
			return getUsingExecute();
		}

		return this._get('size').catch(function (error) {
			// At least ios-driver 0.6.0-SNAPSHOT April 2014 does not support this command
			if (error.name === 'UnknownCommand') {
				return getUsingExecute();
			}

			throw error;
		}).then(function (dimensions) {
			// At least ChromeDriver 2.9 incorrectly returns an object with an additional `toString` property
			return { width: dimensions.width, height: dimensions.height };
		});
	}

	/**
	 * Gets a CSS computed property value for the element.
	 *
	 * @param {string} propertyName
	 * The CSS property to retrieve. This argument must be hyphenated, *not* camel-case.
	 *
	 * @returns {Promise.<string>}
	 */
	getComputedStyle(propertyName: string): Promise<string> {
		const manualGetStyle = () => {
			return this.session.execute(/* istanbul ignore next */ function (element: any, propertyName: string) {
				return (<any> window.getComputedStyle(element, null))[propertyName];
			}, [ this, propertyName ]);
		};

		let promise: Promise<string>;

		if (this.session.capabilities.brokenComputedStyles) {
			promise = manualGetStyle();
		}
		else {
			promise = this._get('css/$0', null, [ propertyName ]).catch(function (error) {
				// At least Selendroid 0.9.0 does not support this command
				if (error.name === 'UnknownCommand') {
					return manualGetStyle();
				}

				// At least ChromeDriver 2.9 incorrectly returns an error for property names it does not understand
				else if (error.name === 'UnknownError' && error.message.indexOf('failed to parse value') > -1) {
					return '';
				}

				throw error;
			});
		}

		return promise.then(function (value) {
			// At least ChromeDriver 2.9 and Selendroid 0.9.0 returns colour values as rgb instead of rgba
			if (value) {
				value = value.replace(/(.*\b)rgb\((\d+,\s*\d+,\s*\d+)\)(.*)/g, function (_, prefix, rgb, suffix) {
					return prefix + 'rgba(' + rgb + ', 1)' + suffix;
				});
			}

			// For consistency with Firefox, missing values are always returned as empty strings
			return value != null ? value : '';
		});
	}

	/**
	 * Gets the first element inside this element matching the given CSS class name.
	 *
	 * @method findByClassName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} className The CSS class name to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByClassName: (selector: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given CSS selector.
	 *
	 * @method findByCssSelector
	 * @memberOf module:leadfoot/Element#
	 * @param {string} selector The CSS selector to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByCssSelector: (selector: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given ID.
	 *
	 * @method findById
	 * @memberOf module:leadfoot/Element#
	 * @param {string} id The ID of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findById: (id: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given name attribute.
	 *
	 * @method findByName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} name The name of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByName: (name: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given case-insensitive link text.
	 *
	 * @method findByLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The link text of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByLinkText: (text: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element partially matching the given case-insensitive link text.
	 *
	 * @method findByPartialLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The partial link text of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByPartialLinkText: (text: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given HTML tag name.
	 *
	 * @method findByTagName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} tagName The tag name of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByTagName: (tagName: string) => Promise<Element>;

	/**
	 * Gets the first element inside this element matching the given XPath selector.
	 *
	 * @method findByXpath
	 * @memberOf module:leadfoot/Element#
	 * @param {string} path The XPath selector to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findByXpath: (path: string) => Promise<Element>;

	/**
	 * Gets all elements inside this element matching the given CSS class name.
	 *
	 * @method findAllByClassName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} className The CSS class name to search for.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByClassName: (className: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element matching the given CSS selector.
	 *
	 * @method findAllByCssSelector
	 * @memberOf module:leadfoot/Element#
	 * @param {string} selector The CSS selector to search for.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByCssSelector: (selector: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element matching the given name attribute.
	 *
	 * @method findAllByName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} name The name of the element.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByName: (name: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element matching the given case-insensitive link text.
	 *
	 * @method findAllByLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The link text of the element.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByLinkText: (text: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element partially matching the given case-insensitive link text.
	 *
	 * @method findAllByPartialLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The partial link text of the element.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByPartialLinkText: (text: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element matching the given HTML tag name.
	 *
	 * @method findAllByTagName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} tagName The tag name of the element.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByTagName: (tagName: string) => Promise<Element[]>;

	/**
	 * Gets all elements inside this element matching the given XPath selector.
	 *
	 * @method findAllByXpath
	 * @memberOf module:leadfoot/Element#
	 * @param {string} path The XPath selector to search for.
	 * @returns {Promise.<module:leadfoot/Element[]>}
	 */
	findAllByXpath: (path: string) => Promise<Element[]>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given query. This is inherently slower than {@link module:leadfoot/Element#find}, so should only be
	 * used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayed
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 *
	 * @param {string} using
	 * The element retrieval strategy to use. See {@link module:leadfoot/Session#find} for options.
	 *
	 * @param {string} value
	 * The strategy-specific value to search for. See {@link module:leadfoot/Session#find} for details.
	 *
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayed: (using: string, value: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given CSS class name. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByClassName
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} className The CSS class name to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByClassName: (className: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given CSS selector. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByCssSelector
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} selector The CSS selector to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByCssSelector: (selector: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given ID. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedById
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} id The ID of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedById: (id: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given name attribute. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByName
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} name The name of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByName: (name: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given case-insensitive link text. This is inherently slower than {@link module:leadfoot/Element#find},
	 * so should only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByLinkText
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} text The link text of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByLinkText: (text: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * partially matching the given case-insensitive link text. This is inherently slower than
	 * {@link module:leadfoot/Element#find}, so should only be used in cases where the visibility of an element cannot be
	 * ensured in advance.
	 *
	 * @method findDisplayedByPartialLinkText
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} text The partial link text of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByPartialLinkText: (text: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given HTML tag name. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByTagName
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} tagName The tag name of the element.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByTagName: (tagName: string) => Promise<Element>;

	/**
	 * Gets the first {@link module:leadfoot/Element#isDisplayed displayed} element inside this element
	 * matching the given XPath selector. This is inherently slower than {@link module:leadfoot/Element#find}, so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @method findDisplayedByXpath
	 * @memberOf module:leadfoot/Element#
	 * @since 1.6
	 * @param {string} path The XPath selector to search for.
	 * @returns {Promise.<module:leadfoot/Element>}
	 */
	findDisplayedByXpath: (path: string) => Promise<Element>;

	/**
	 * Waits for all elements inside this element that match the given query to be destroyed.
	 *
	 * @method waitForDeleted
	 * @memberOf module:leadfoot/Element#
	 *
	 * @param {string} using
	 * The element retrieval strategy to use. See {@link module:leadfoot/Session#find} for options.
	 *
	 * @param {string} value
	 * The strategy-specific value to search for. See {@link module:leadfoot/Session#find} for details.
	 *
	 * @returns {Promise.<void>}
	 */
	waitForDeleted: (using: string, value: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given CSS class name to be destroyed.
	 *
	 * @method waitForDeletedByClassName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} className The CSS class name to search for.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByClassName: (className: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given CSS selector to be destroyed.
	 *
	 * @method waitForDeletedByCssSelector
	 * @memberOf module:leadfoot/Element#
	 * @param {string} selector The CSS selector to search for.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByCssSelector: (selector: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given ID to be destroyed.
	 *
	 * @method waitForDeletedById
	 * @memberOf module:leadfoot/Element#
	 * @param {string} id The ID of the element.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedById: (id: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given name attribute to be destroyed.
	 *
	 * @method waitForDeletedByName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} name The name of the element.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByName: (name: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given case-insensitive link text to be destroyed.
	 *
	 * @method waitForDeletedByLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The link text of the element.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByLinkText: (text: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element partially matching the given case-insensitive link text to be
	 * destroyed.
	 *
	 * @method waitForDeletedByPartialLinkText
	 * @memberOf module:leadfoot/Element#
	 * @param {string} text The partial link text of the element.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByPartialLinkText: (text: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given HTML tag name to be destroyed.
	 *
	 * @method waitForDeletedByTagName
	 * @memberOf module:leadfoot/Element#
	 * @param {string} tagName The tag name of the element.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByTagName: (tagName: string) => Promise<void>;

	/**
	 * Waits for all elements inside this element matching the given XPath selector to be destroyed.
	 *
	 * @method waitForDeletedByXpath
	 * @memberOf module:leadfoot/Element#
	 * @param {string} path The XPath selector to search for.
	 * @returns {Promise.<void>}
	 */
	waitForDeletedByXpath: (path: string) => Promise<void>;
}

util.applyMixins(Element, [ Strategies, FindDisplayed, WaitForDeleted ]);
