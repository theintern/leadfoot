define({
	capabilities: {
		'idle-timeout': 30
	},

	environments: [
		{ browserName: 'microsoftedge', fixSessionCapabilities: false },
		{ browserName: 'internet explorer', version: '11', platform: 'WIN8', fixSessionCapabilities: false },
		{ browserName: 'internet explorer', version: '10', platform: 'WIN8', fixSessionCapabilities: false },
		{ browserName: 'internet explorer', version: '9', platform: 'WINDOWS', fixSessionCapabilities: false },
		{ browserName: 'firefox', version: [ '33', '49' ], platform: [ 'WINDOWS', 'MAC' ], fixSessionCapabilities: false },
		{ browserName: 'chrome', version: [ '38', '52' ], platform: [ 'WINDOWS', 'MAC' ], fixSessionCapabilities: false },
		{ browserName: 'safari', version: [ '9', '10' ], platform: 'MAC', fixSessionCapabilities: false }
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
		'leadfoot/tests/functional/helpers/dijit',
		'leadfoot/tests/functional/Server',
		'leadfoot/tests/functional/Session',
		'leadfoot/tests/functional/Element',
		'leadfoot/tests/functional/Command',
		'leadfoot/tests/functional/compat'
	],

	excludeInstrumentation: /^(?:tests|node_modules)\//
});
