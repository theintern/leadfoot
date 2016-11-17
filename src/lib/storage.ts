import { Thenable } from '../interfaces';

export class LocalStorage {
	getLocalStorageKeys: () => Thenable<string[]>;
	setLocalStorageItem: (key: string, value: string) => Thenable<void>;
	clearLocalStorage: () => Thenable<void>;
	getLocalStorageItem: (key: string) => Thenable<string>;
	deleteLocalStorageItem: (key: string) => Thenable<void>;
	getLocalStorageLength: ()  => Thenable<number>;
}

export class SessionStorage {
	getSessionStorageKeys: () => Thenable<string[]>;
	setSessionStorageItem: (key: string, value: string) => Thenable<void>;
	clearSessionStorage: () => Thenable<void>;
	getSessionStorageItem: (key: string) => Thenable<string>;
	deleteSessionStorageItem: (key: string) => Thenable<void>;
	getSessionStorageLength: ()  => Thenable<number>;
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
		return function (this: any, key: string) {
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
		prototype[method.replace('_', methodType)] = (<any> METHODS)[method](type);
	}
}

applyTo(LocalStorage, 'local');
applyTo(SessionStorage, 'session');
