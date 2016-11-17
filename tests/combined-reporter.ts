import * as intern from 'intern';
// TODO: logError does not exist in intern/lib/util
// import * as util from 'intern/lib/util';
import * as fs from 'dojo/node!fs';
import Collector = require('dojo/node!istanbul/lib/collector');
import JsonReporter = require('dojo/node!istanbul/lib/report/json');
import LcovHtmlReporter = require('dojo/node!istanbul/lib/report/html');
import TextReporter = require('dojo/node!istanbul/lib/report/text');

const collector = new Collector();
let reporters: any = [];

if (intern.mode === 'client') {
	reporters = [ new JsonReporter() ];
}
else {
	reporters = [ new TextReporter(), new LcovHtmlReporter() ];
}

const reporter = {
	start() {
		console.log('Running ' + intern.mode + ' tests…');
	},

	'/session/start'(remote) {
		console.log('Testing ' + remote.environmentType);
	},

	'/coverage'(sessionId, coverage) {
		collector.add(coverage);
	},

	'/error'(error) {
		// util.logError(error);
	},

	'/launcher/start'() {
		console.log('Starting launcher');
	},

	'/launcher/download/progress'(launcher, progress) {
		console.log('Download ' + (progress.received / progress.total * 100) + '% complete');
	},

	'/launcher/status'(launcher, status) {
		console.log('Launcher: ' + status);
	},

	'/test/fail'(test) {
		console.error('FAIL: ' + test.id);
		// util.logError(test.error);
	},

	stop() {
		if (intern.mode === 'runner' && fs.existsSync('coverage-final.json')) {
			collector.add(JSON.parse(fs.readFileSync('coverage-final.json').toString()));
		}

		reporters.forEach(function (reporter) {
			reporter.writeReport(collector, true);
		});
	}
};

export default reporter;
