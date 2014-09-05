/**
 * @module leadfoot/helpers/dijit
 */

/**
 * A {@link module:leadfoot/Command} helper that returns an object for quickly
 * referencing Dijit instances and their properties.
 * This helper assumes that the dojo and dijit packages
 * are defined in your Intern or leadfoot config
 *
 * @param {string} widgetId
 * An id for a Dijit reference
 *
 * @param {string} property
 * A string representing a Dijit instance property, for example, a domNode.
 *
 * @example
 * var Command = require('leadfoot/Command');
 * var pollUntil = require('leadfoot/helpers/dijit');
 *
 * new Command(session)
 *     .get('http://example.com')
 *     .then(dijit.getProperty('someId', 'domNode'))
 *     .then(function (node, setContext) {
 *         setContext(node);
 *     })
 *     .click();
 */

module.exports = {
	get: function (widgetId) {
		function getMethods (session, widgetId) {
			return session.executeAsync(function (widgetId, done) {
				require([ 'dijit/registry' ], function (registry) {
					var widget = registry.byId(widgetId);
					if (!widget) {
						done(new Error('Could not find widget "' + widgetId + '"'));
					}
					var methods = [];
					for (var key in widget) {
						methods.push(key);
					}
					done(methods);
				});
			}, [widgetId]);
		}
		return function () {
			var session = this.session;
			return getMethods(session, widgetId).then(function (methods) {
				function proxy(key) {
					return function () {
						return session.executeAsync(function (widgetId, key, args, done) {
							require([ 'dijit/registry', 'dojo/when' ], function (registry, when) {
								var widget = registry.byId(widgetId);
								when(widget[key].apply(widget, args)).always(done);
							});
						}, [widgetId, key, Array.prototype.slice.call(arguments, 0)]);
					};
				}

				var widget = {};
				methods.forEach(function (key) {
					widget[key] = proxy(key);
				});
				return widget;
			});
		};
	},

	getProperty: function (widgetId, property) {
		return function () {
			return this.session.executeAsync(function (widgetId, property, done) {
				require([ 'dijit/registry' ], function (registry) {
					var widget = registry.byId(widgetId);
					if (!widget) {
						done(new Error('Could not find widget "' + widgetId + '"'));
					}
					else {
						done(property ? widget.get(property) : widget);
					}
				});
			}, [widgetId, property]);
		};
	}
};
