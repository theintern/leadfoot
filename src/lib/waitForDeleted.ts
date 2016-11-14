import Promise = require('dojo/Promise');
import statusCodes from './statusCodes';

const waitForDeleted = {
	applyTo: function (prototype: any) {
		prototype.waitForDeleted = function (strategy: string, value: string): Promise<void> {
			const self = this;
			const session = this.session || this;
			let originalTimeout: number;

			return session.getTimeout('implicit').then(function (value: number) {
				originalTimeout = value;
				return session.setTimeout('implicit', 0);
			}).then(function () {
				const dfd = new Promise.Deferred();
				const startTime = Date.now();

				(function poll() {
					if (Date.now() - startTime > originalTimeout) {
						const always = function () {
							const error = new Error();
							error.status = 21;
							error.name = statusCodes[error.status][0];
							error.message = statusCodes[error.status][1];
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
		};
	}
};

export default waitForDeleted;
