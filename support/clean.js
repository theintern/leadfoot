#!/usr/bin/env node

const shell = require('shelljs');
const path = require('path');

shell.echo('### Cleaning Leadfoot');

[
	path.join(__dirname, '..', '_build'),
	path.join(__dirname, '..', 'html-report'),
].forEach(function (dir) {
	shell.echo('removing ', dir);
	shell.rm('-rf', dir);
});
