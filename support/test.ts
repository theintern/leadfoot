import { cd, echo, exec } from 'shelljs';
import { join } from 'path';

const dir = join(__dirname, '..');

cd(dir);

exec('./node_modules/.bin/ts-node ./support/build.ts');
echo('### Testing Leadfoot');
exec('./node_modules/.bin/intern-runner config=_build/tests/intern');
