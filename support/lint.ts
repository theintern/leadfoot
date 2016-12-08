import { cd, echo, exec } from 'shelljs';
import { join } from 'path';

const dir = join(__dirname, '..');

cd(dir);
echo('### Linting Leadfoot');

exec('./node_modules/.bin/tslint -c tslint.json ./src/**/*.ts');
