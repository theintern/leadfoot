#!/usr/bin/env node

const shell = require('shelljs');
const path = require('path');
const exec = require('./common').exec;

const dir = path.join(__dirname, '..');

shell.cd(dir);
shell.echo('### Testing Leadfoot');

exec('./node_modules/.bin/tsc').then(function () {
	return exec('./node_modules/.bin/intern-runner config=_build/tests/intern');
});
