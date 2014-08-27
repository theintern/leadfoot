/**
 * @module leadfoot/helpers/getDijit
 */

var util = require('../lib/util');

/**
 * A {@link module:leadfoot/Command} helper that returns a reference
 * to a widget or widget property or node. Assumes that the dijit package
 * is defined in your Intern or leadfoot config
 *
 * @param {string} widgetId
 * An id for a Dijit reference
 *
 * @param {string} property
 * A string representing a Dijit instance property, for example, a domNode.
 *
 * @example
 * var Command = require('leadfoot/Command');
 * var pollUntil = require('leadfoot/helpers/getDijit');
 *
 * new Command(session)
 *     .get('http://example.com')
 *     .then(getDijit('someId', 'domNode'))
 *     .then(function (node, setContext) {
 *         setContext(node);
 *     })
 *     .click();
 */
module.exports = function (widgetId, property) {
	return function () {
		return new this.constructor(this.session).executeAsync(function (widgetId, property, done) {
			require([ 'dijit/registry' ], function (registry) {
				var widget = registry.byId(widgetId);
				if (!widget) {
					done(new Error('Could not find widget'));
				}
				else {
					done(property ? widget[property] : widget);
				}
			});
		}, [widgetId, property]);
	}
};
