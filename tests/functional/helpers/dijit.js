define([
	'intern!object',
	'intern/chai!assert',
	'intern/dojo/node!../../../Command',
	'intern/dojo/node!../../../helpers/dijit',
	'../support/util',
	'require'
], function (registerSuite, assert, Command, dijit, util, require) {
	registerSuite(function () {
		var command;
		return {
			name: 'leadfoot/helpers/dijit',

			setup: function () {
				return util.createSessionFromRemote(this.remote).then(function (session) {
					command = new Command(session);
				});
			},

			'basic test': function () {
				return command
					.get(require.toUrl('../data/dijit.html'))
					.setFindTimeout(10000)
					.setPageLoadTimeout(5000)
					.setExecuteAsyncTimeout(10000)
					.then(pollUntil('return window.ready',
						[], 5000))
					.then(dijit.getProperty('yesButton', 'focusNode'))
					.then(function (node, setContext) {
						setContext(node);
					})
					.click()
					.then(dijit.get('testForm')),
					.then(function (widget) {
						return widget.get('value');
					})
					.then(function (formValue) {
						assert.deepEqual(formValue, {
							answer: 'yes'
					});
				});
			}
		};
	});
});
