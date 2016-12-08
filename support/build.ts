import { cd, echo, cp, exec } from 'shelljs';
import { join } from 'path';

const dir = join(__dirname, '..');

cd(dir);
echo('### Building Leadfoot');

exec('./node_modules/.bin/tsc -p ./src/tsconfig.json');
cp('./src/interfaces.d.ts', './_build/src/');
exec('./node_modules/.bin/tsc -p ./tests/tsconfig.json');
