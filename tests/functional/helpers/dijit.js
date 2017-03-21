define([
	'intern!object',
	'intern/chai!assert',
	'intern/dojo/node!../../../Command',
	'intern/dojo/node!../../../helpers/dijit',
	'../support/util',
	'require'
], function (registerSuite, assert, Command, remoteRegistry, util, require) {
	registerSuite(function () {
		var command;
		return {
			name: 'leadfoot/helpers/dijit',

			setup: function () {
				return util.createSessionFromRemote(this.remote).then(function (session) {
					command = new Command(session);
				});
			},

			'.getProperty': function () {
				return command
					.get(require.toUrl('../data/dijit.html'))
					.setFindTimeout(4000)
					.setPageLoadTimeout(4000)
					.setExecuteAsyncTimeout(4000)
					.then(remoteRegistry.getProperty('foo', 'c'))
					.then(function (c) {
						assert.strictEqual(c, 3, 'widget.getProperty(foo, c) === 3');
					})
			},

			'.byId': function () {
				return command
					.get(require.toUrl('../data/dijit.html'))
					.setFindTimeout(4000)
					.setPageLoadTimeout(4000)
					.setExecuteAsyncTimeout(4000)
					.then(remoteRegistry.byId('foo'))
					.then(function (widget) {
						assert.isFunction(widget.get, 'widget.get is a function');
						return widget.get('a');
					})
					.then(function (a) {
						assert.strictEqual(a, 1, 'widget.get(a) === 1');
					});
			},

			'.nodeById': function () {
				return command
					.get(require.toUrl('../data/dijit.html'))
					.setFindTimeout(4000)
					.setPageLoadTimeout(4000)
					.setExecuteAsyncTimeout(4000)
					.then(remoteRegistry.nodeById('foo', 'node'))
					.then(function (node) {
						assert.strictEqual(node.tagName, 'div', 'widget.getNode(foo, node).tagName === div');
					})
			}

		};
	});
});
