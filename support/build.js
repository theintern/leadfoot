#!/usr/bin/env node

const shell = require('shelljs');
const path = require('path');
const exec = require('./common').exec;

const dir = path.join(__dirname, '..');

shell.cd(dir);
shell.echo('### Building Leadfoot');

exec('./node_modules/.bin/tsc -p ./tests/tsconfig.json').then(function () {
	shell.cp('./src/interfaces.d.ts', './_build/src/');
	return exec('./node_modules/.bin/tsc -p ./src/tsconfig.json');
});
