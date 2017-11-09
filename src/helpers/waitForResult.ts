import pollUntil from './pollUntil';
import * as util from '../lib/util';
import Task from '@dojo/core/async/Task';

export default function waitForResult<T>(
	poller: Poller | string,
	args?: any[],
	timeout?: number,
	pollInterval?: number
): () => Task<T>;

export default function waitForResult<T>(
	poller: Poller | string,
	timeout?: number,
	pollInterval?: number
): () => Task<T>;

export default function waitForResult<T>(
	poller: Poller | string,
	argsOrTimeout?: any[] | number,
	timeout?: number,
	pollInterval?: number
): () => Task<T> {
	let args: any[] | undefined;

	if (typeof argsOrTimeout === 'number') {
		pollInterval = timeout;
		timeout = argsOrTimeout;
	} else {
		args = argsOrTimeout;
	}

	args = args || [];
	args.unshift(util.toExecuteString(poller));

	poller = <Poller> function (poller: string): any {
		const args: any[] = Array.prototype.slice.apply(arguments).slice(1);
		const result = new Function(poller).apply(null, args);
		if (result) {
			return result;
		}
	};

	return pollUntil.apply(null, [poller, args, timeout, pollInterval]);
}

export type Poller = () => any;
