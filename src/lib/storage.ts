import Promise = require('dojo/Promise');

export class LocalStorage {
	getLocalStorageKeys: () => Promise<string[]>;
	setLocalStorageItem: (key: string, value: string) => Promise<void>;
	clearLocalStorage: () => Promise<void>;
	getLocalStorageItem: (key: string) => Promise<string>;
	deleteLocalStorageItem: (key: string) => Promise<void>;
	getLocalStorageLength: ()  => Promise<number>;
}

export class SessionStorage {
	getSessionStorageKeys: () => Promise<string[]>;
	setSessionStorageItem: (key: string, value: string) => Promise<void>;
	clearSessionStorage: () => Promise<void>;
	getSessionStorageItem: (key: string) => Promise<string>;
	deleteSessionStorageItem: (key: string) => Promise<void>;
	getSessionStorageLength: ()  => Promise<number>;
}

const METHODS = {
	get_StorageKeys: function (type: string) {
		return function (this: any) {
			return this._get(type + '_storage');
		};
	},

	set_StorageItem: function (type: string) {
		return function (this: any, key: string, value: string) {
			return this._post(type + '_storage', {
				key: key,
				value: value
			});
		};
	},

	clear_Storage: function (type: string) {
		return function (this: any) {
			return this._delete(type + '_storage');
		};
	},

	get_StorageItem: function (type: string) {
		return function (this: any, key: string) {
			return this._get(type + '_storage/key/$0', null, [ key ]);
		};
	},

	delete_StorageItem: function (type: string) {
		return function (this: any, key) {
			return this._delete(type + '_storage/key/$0', null, [ key ]);
		};
	},

	get_StorageLength: function (type: string) {
		return function (this: any) {
			return this._get(type + '_storage/size');
		};
	}
};

function applyTo(prototype: any, type: string): void {
	const methodType = type.charAt(0).toUpperCase() + type.slice(1);
	for (let method in METHODS) {
		prototype[method.replace('_', methodType)] = METHODS[method](type);
	}
}

applyTo(LocalStorage, 'local');
applyTo(SessionStorage, 'session');
