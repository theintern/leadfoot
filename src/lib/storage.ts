import Session from '../Session';

const METHODS = {
	get_StorageKeys: function (type: string) {
		return function (this: Session) {
			return this._get(type + '_storage');
		};
	},

	set_StorageItem: function (type: string) {
		return function (this: Session, key, value) {
			return this._post(type + '_storage', {
				key: key,
				value: value
			});
		};
	},

	clear_Storage: function (type: string) {
		return function (this: Session) {
			return this._delete(type + '_storage');
		};
	},

	get_StorageItem: function (type: string) {
		return function (this: Session, key) {
			return this._get(type + '_storage/key/$0', null, [ key ]);
		};
	},

	delete_StorageItem: function (type: string) {
		return function (this: Session, key) {
			return this._delete(type + '_storage/key/$0', null, [ key ]);
		};
	},

	get_StorageLength: function (type: string) {
		return function (this: Session) {
			return this._get(type + '_storage/size');
		};
	}
};

const storage = {
	applyTo(prototype: any, type: string): void {
		const methodType = type.charAt(0).toUpperCase() + type.slice(1);
		for (let method in METHODS) {
			prototype[method.replace('_', methodType)] = METHODS[method](type);
		}
	}
};

export default storage;

