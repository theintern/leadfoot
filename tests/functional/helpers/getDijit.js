define([
	'intern!object',
	'intern/chai!assert',
	'intern/dojo/node!../../../Command',
	'intern/dojo/node!../../../helpers/getDijit',
	'../support/util',
	'require'
], function (registerSuite, assert, Command, pollUntil, util, require) {
	registerSuite(function () {
		var command;
		return {
			name: 'leadfoot/helpers/getDijit',

			setup: function () {
				return util.createSessionFromRemote(this.remote).then(function (session) {
					command = new Command(session);
				});
			},

			'basic test': function () {
				return command
					.setFindTimeout(10000)
					.setPageLoadTimeout(5000)
					.setExecuteAsyncTimeout(10000)
					.then(pollUntil('return window.ready',
						[], 5000))
					.then(getDijit('yesButton', 'focusNode'))
					.then(function (node, setContext) {
						setContext(node);
					})
					.click()
					.then(getDijit('testForm'))
					.then(function (form) {
						assert.deepEqual(form.get('value'), {
							answer: 'yes'
					});
				});
			}
		};
	});
});
