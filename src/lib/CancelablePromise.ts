import ExtensiblePromise, { ListOfPromises, DictionaryOfPromises } from 'dojo-core/async/ExtensiblePromise';
import { Iterable } from 'dojo-shim/iterator';
import { Executor }  from 'dojo-shim/Promise';
import { Thenable } from 'dojo-shim/interfaces';

export default class CancelablePromise<T> extends ExtensiblePromise<T> {
	static reject<T>(reason?: Error): CancelablePromise<T> {
		return <CancelablePromise<T>> super.reject(reason);
	}

	public static resolve(): CancelablePromise<void>;
	public static resolve<T>(value: (T | Thenable<T>)): CancelablePromise<T>;
	public static resolve<T>(value?: any): CancelablePromise<T> {
		return new this<T>((resolve, reject) => resolve(value));
	}

	static all<T>(iterable: DictionaryOfPromises<T>): CancelablePromise<{ [key: string]: T }>;
	static all<T>(iterable: (T | Thenable<T>)[]): CancelablePromise<T[]>;
	static all<T>(iterable: T | Thenable<T>): CancelablePromise<T[]>;
	static all<T>(iterable: ListOfPromises<T>): CancelablePromise<T[]>;
	static all<T>(iterable: DictionaryOfPromises<T> | ListOfPromises<T>): CancelablePromise<any> {
		return <CancelablePromise<any>> super.all(iterable);
	}

	static race<T>(iterable: Iterable<(T | Thenable<T>)> | (T | Thenable<T>)[]): CancelablePromise<T> {
		return <CancelablePromise<T>> super.race(iterable);
	}

	private _resolve: (value?: T | Thenable<T> | undefined) => void;
	private _reject: (reason?: any) => void;
	private _canceler: () => void;
	private _cancelled: boolean;

	constructor(executor: Executor<T>, canceler?: () => void) {
		let superResolve: (value?: T | Thenable<T> | CancelablePromise<T> | undefined) => void = () => {};
		let superReject: (reason?: any) => void = () => {};

		super((resolve, reject) => {
			superResolve = resolve;
			superReject = reject;
		});

		this._resolve = superResolve;
		this._reject = superReject;

		this._cancelled = false;

		this._canceler = () => {
			if (canceler) {
				canceler();
			}
		};

		try {
			executor(
				(value) => {
					superResolve(value);
				},
				(reason) => {
					superReject(reason);
				}
			);
		}
		catch (reason) {
			superReject(reason);
		}
	}

	cancel(): void {
		const reason = new Error('Cancelled');
		reason.name = 'CancelError';

		this._cancelled = true;
		this._reject(reason);
		this._canceler();
	}

	get cancelled() {
		return this._cancelled;
	}

	catch(onRejected: (reason: Error) => T | Thenable<T> | void): CancelablePromise<T>;
	catch<U>(onRejected: (reason: Error) => U | Thenable<U>): CancelablePromise<U> {
		return <CancelablePromise<U>> this.then(undefined, onRejected);
	}

	/**
	 * Allows for cleanup actions to be performed after resolution of a Promise.
	 */
	finally(callback: () => void | Thenable<any>): CancelablePromise<any> {
		return this.then(callback, callback);
	}

	then<U, V>(onFulfilled: ((value: T) => (U | Thenable<U> | undefined)) | undefined, onRejected: (reason: Error) => (V | Thenable<V>)): CancelablePromise<U | V>;
	then<U>(onFulfilled?: ((value: T) => (U | Thenable<U> | undefined)) | undefined, onRejected?: (reason: Error) => void): CancelablePromise<U>;
	then<U>(onFulfilled?: ((value: T) => (U | Thenable<U> | undefined)) | undefined, onRejected?: (reason: Error) => (U | Thenable<U>)): CancelablePromise<U>;
	then<U>(onFulfilled?: (value?: T) => U | Thenable<U>, onRejected?: (error: Error) => U | Thenable<U>): CancelablePromise<U> {
		return <CancelablePromise<U>> super.then(onFulfilled, onRejected);
	}
}
