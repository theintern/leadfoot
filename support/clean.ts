import { echo, rm } from 'shelljs';
import { join } from 'path';

echo('### Cleaning Leadfoot');

const dirs = [
	join(__dirname, '..', '_build'),
	join(__dirname, '..', 'html-report')
];

for (let dir of dirs) {
	echo(`removing ${dir}`);
	rm('-rf', dir);
}
