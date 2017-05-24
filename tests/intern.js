define([ 'intern' ], function (intern) {
	var config = {
		capabilities: {
			'idle-timeout': 30
		},

		environments: [
			{ browserName: 'microsoftedge', fixSessionCapabilities: false },
			{ browserName: 'internet explorer', version: '11', fixSessionCapabilities: false },
			{ browserName: 'internet explorer', version: '10', fixSessionCapabilities: false },
			{ browserName: 'internet explorer', version: '9', fixSessionCapabilities: false },
			{ browserName: 'firefox', version: [ '33', '53' ], platform: [ 'WINDOWS', 'MAC' ], fixSessionCapabilities: false },
			{ browserName: 'safari', version: [ '9', '10' ], fixSessionCapabilities: false }
		],

		maxConcurrency: 2,
		tunnel: 'BrowserStackTunnel',

		loaderOptions: {
			packages: [
				{ name: 'leadfoot', location: '.' }
			]
		},

		suites: [
			'dojo/has!host-node?leadfoot/tests/unit/lib/util',
			'dojo/has!host-node?leadfoot/tests/unit/compat'
		],

		functionalSuites: [
			'leadfoot/tests/functional/helpers/pollUntil',
			'leadfoot/tests/functional/Server',
			'leadfoot/tests/functional/Session',
			'leadfoot/tests/functional/Element',
			'leadfoot/tests/functional/Command',
			'leadfoot/tests/functional/compat'
		],

		excludeInstrumentation: /^(?:tests|node_modules)\//
	};

	if (intern.args.service === 'sauce') {
		var platforms = {
			WINDOWS: 'Windows 10',
			MAC: 'OS X 10.12'
		};
		config.environments.forEach(function (environment) {
			if (environment.platform) {
				environment.platform = environment.platform.map(function (platform) {
					return platforms[platform] || platform;
				});
			}
		});
		config.tunnel = 'SauceLabsTunnel';
	}

	if (intern.args.service === 'testingbot') {
		var platforms = {
			WINDOWS: 'WIN10',
			MAC: 'SIERRA'
		};
		config.environments.forEach(function (environment) {
			if (environment.platform) {
				environment.platform = environment.platform.map(function (platform) {
					return platforms[platform] || platform;
				});
			}
		});
		config.tunnel = 'TestingBotTunnel';
	}

	return config;
});
