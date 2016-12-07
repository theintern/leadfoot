import Promise = require('dojo/Promise');
import statusCodes from './statusCodes';
import Session from '../Session';
import Element from '../Element';
import { Thenable } from '../interfaces';

abstract class WaitForDeleted<E extends Thenable<Element>, V extends Thenable<void>> {
	session?: Session;

	abstract find(strategy: string, value: string): E;

	waitForDeleted(strategy: string, value: string): V {
		const self = this;
		const session = <Session> (this.session || this);
		let originalTimeout: number;

		return <any> session.getTimeout('implicit').then(function (value) {
			originalTimeout = value;
			session.setTimeout('implicit', 0);
		}).then(function () {
			const dfd = new Promise.Deferred<void>();
			const startTime = Date.now();

			(function poll() {
				if (Date.now() - startTime > originalTimeout) {
					const always = function () {
						const error: any = new Error();
						error.status = 21;
						error.name = (<any> statusCodes)[error.status][0];
						error.message = (<any> statusCodes)[error.status][1];
						dfd.reject(error);
					};
					session.setTimeout('implicit', originalTimeout).then(always, always);
					return;
				}

				self.find(strategy, value).then(poll, function (error) {
					const always = function () {
						/* istanbul ignore else: other errors should never occur during normal operation */
						if (error.name === 'NoSuchElement') {
							dfd.resolve();
						}
						else {
							dfd.reject(error);
						}
					};
					session.setTimeout('implicit', originalTimeout).then(always, always);
				});
			})();

			return dfd.promise;
		});
	}
}

export default WaitForDeleted;
