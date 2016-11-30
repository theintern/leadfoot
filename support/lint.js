#!/usr/bin/env node

const shell = require('shelljs');
const path = require('path');
const exec = require('./common').exec;

const dir = path.join(__dirname, '..');

shell.cd(dir);
shell.echo('### Linting Leadfoot');

exec('./node_modules/.bin/tslint -c tslint.json ./src/**/*.ts');
