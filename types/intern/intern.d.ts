declare module 'intern' {
	import main = require('intern/main');
	export = main;
}

declare module 'intern/main' {
	import Promise = require('dojo/Promise');
	import Suite = require('intern/lib/Suite');

	export interface Config {
		capabilities?: any;
		coverageVariable?: string;
		defaultTimeout?: number;
		environments?: any[];
		environmentRetries?: number;
		excludeInstrumentation?: RegExp;
		functionalSuites?: string[];
		grep?: RegExp;
		loader?: any;
		loaderOptions?: any;
		loaders?: {
			'host-browser'?: string;
			'host-node'?: string;
		};
		maxConcurrency?: number;
		proxyPort?: number;
		proxyUrl?: string;
		reporters?: string[];
		suites?: string[];
		tunnel?: string;
		tunnelOptions?: any;
		useLoader?: {
			'host-browser'?: string;
			'host-node'?: string;
		};
	}

	export var args: any;
	export var executor: {
		register(fn: (suite: Suite) => void): void;
		run(): Promise<number>;
		suites: Suite[];
	};
	export var mode: string;
}

declare module 'intern!bdd' {
	import Test = require('intern/lib/Test');

	const bdd: {
		after(fn: () => any): void;
		afterEach(fn: (test: Test) => any): void;
		before(fn: () => any): void;
		beforeEach(fn: (test: Test) => any): void;
		describe(name: string, factory: () => void): void;
		it(name: string, test: () => any): void;
	};

	export = bdd;
}

declare module 'intern!object' {
	const createSuite: {
		(definition: {}): void;
		(definition:() => {}): void;
	};

	export = createSuite;
}

declare module 'intern!tdd' {
	import Promise = require('dojo/Promise');
	import Test = require('intern/lib/Test');

	const tdd: {
		after(fn: () => any): void;
		afterEach(fn: (test: Test) => any): void;
		before(fn: () => any): void;
		beforeEach(fn: (test: Test) => any): void;
		suite(name: string, factory: () => void): void;
		test(name: string, test: () => any): void;
	};

	export = tdd;
}

declare module 'intern/chai!' {
	export = Chai;
}

declare module 'intern/chai!assert' {
	const assert: Chai.AssertStatic;
	export = assert;
}

declare module 'intern/chai!expect' {
	const expect: Chai.ExpectStatic;
	export = expect;
}

declare module 'intern/chai!should' {
	function should(): void;
	export = should;
}

declare module 'intern/dojo/has' {
	function has(name: string): any;
	export = has;
}

declare module 'intern/lib/ReporterManager' {
	import Promise = require('dojo/Promise');

	class ReporterManager {
		add(ReporterCtor: Function, options: {}): { remove(): void; };
		emit(eventName: string, ...args: any[]): Promise<void>;
		empty(): void;
		on(eventName: string, ...args: any[]): { remove(): void; };
		run(): Promise<void>;
	}

	export = ReporterManager;
}

declare module 'intern/lib/Suite' {
	import Command = require('leadfoot/Command');
	import Promise = require('dojo/Promise');
	import ReporterManager = require('intern/lib/ReporterManager');
	import Test = require('intern/lib/Test');

	class Suite {
		constructor(kwArgs?: Suite.KwArgs);

		name: string;

		tests: Array<Test | Suite>;

		parent: Suite;

		setup: () => Promise.Thenable<void> | void;
		beforeEach: (test: Test) => Promise.Thenable<void> | void;
		afterEach: (test: Test) => Promise.Thenable<void> | void;
		teardown: () => Promise.Thenable<void> | void;

		error: Error;

		timeElapsed: number;

		timeout: number;

		/**
		 * A regular expression used to filter, by test ID, which tests are run.
		 */
		grep: RegExp;

		/**
		 * The WebDriver interface for driving a remote environment. This value is only guaranteed to exist from the
		 * setup/beforeEach/afterEach/teardown and test methods, since environments are not instantiated until they are
		 * actually ready to be tested against. This property is only available to functional suites.
		 */
		remote: Command<void>;

		reporterManager: ReporterManager;

		/**
		 * If true, the suite will only publish its start topic after the setup callback has finished,
		 * and will publish its end topic before the teardown callback has finished.
		 */
		publishAfterSetup: boolean;

		/**
		 * The unique identifier of the suite, assuming all combinations of suite + test are unique.
		 */
		id: string;

		/**
		 * The sessionId of the environment in which the suite executed.
		 */
		sessionId: string;

		/**
		 * The total number of tests in this suite and any sub-suites. To get only the number of tests for this suite,
		 * look at `this.tests.length`.
		 *
		 * @readonly
		 */
		numTests: number;

		/**
		 * The total number of tests in this test suite and any sub-suites that have failed.
		 *
		 * @readonly
		 */
		numFailedTests: number;

		/**
		 * The total number of tests in this test suite and any sub-suites that were skipped.
		 *
		 * @readonly
		 */
		numSkippedTests: number;

		/**
		* Runs test suite in order:
		*
		* * setup
		* * for each test:
		*   * beforeEach
		*   * test
		*   * afterEach
		* * teardown
		*
		* If setup, beforeEach, afterEach, or teardown throw, the suite itself will be marked as failed
		* and no further tests in the suite will be executed.
		*
		* @returns {dojo/promise/Promise}
		*/
		run(): Promise<number>;

		toJSON(): Suite.Serialized;
	}

	module Suite {
		export interface KwArgs {
			name: typeof Suite.prototype.name;
			parent: typeof Suite.prototype.parent;
			tests?: typeof Suite.prototype.tests;
			setup?: typeof Suite.prototype.setup;
			beforeEach?: typeof Suite.prototype.setup;
			afterEach?: typeof Suite.prototype.setup;
			teardown?: typeof Suite.prototype.setup;
			grep?: typeof Suite.prototype.grep;
			remote?: typeof Suite.prototype.remote;
			reporterManager?: typeof Suite.prototype.reporterManager;
		}

		export interface Serialized {
			name: string;
			sessionId: string;
			hasParent: boolean;
			tests: Array<Test.Serialized>;
			timeElapsed: number;
			numTests: number;
			numFailedTests: number;
			numSkippedTests: number;
			error?: {
				name: string;
				message: string;
				stack: string;
				relatedTest: Test;
			}
		}
	}

	export = Suite;
}

declare module 'intern/lib/Test' {
	import Command = require('leadfoot/Command');
	import Promise = require('dojo/Promise');
	import ReporterManager = require('intern/lib/ReporterManager');
	import Suite = require('intern/lib/Suite');

	class Test {
		constructor(kwArgs?: Test.KwArgs);

		name: string;
		test: () => any;
		parent: Suite;
		timeout: number;
		isAsync: boolean;
		timeElapsed: number;
		hasPassed: boolean;
		skipped: string;
		error: Error;

		/**
		 * The unique identifier of the test, assuming all combinations of suite + test are unique.
		 *
		 * @readonly
		 */
		id: string;

		/**
		 * The WebDriver interface for driving a remote environment.
		 *
		 * @see module:intern/lib/Suite#remote
		 * @readonly
		 */
		remote: Command<void>;

		reporterManager: ReporterManager;

		sessionId: string;

		/**
		 * A convenience function that generates and returns a special Deferred that can be used for asynchronous
		 * testing.
		 * Once called, a test is assumed to be asynchronous no matter its return value (the generated Deferred's
		 * promise will always be used as the implied return value if a promise is not returned by the test function).
		 *
		 * @param timeout
		 * If provided, the amount of time to wait before rejecting the test with a timeout error, in milliseconds.
		 *
		 * @param numCallsUntilResolution
		 * The number of times that resolve needs to be called before the Deferred is actually resolved.
		 */
		async(timeout?: number, numCallsUntilResolution?: number): Test.Deferred<void>;

		/**
		 * Runs the test.
		 */
		run(): Promise<void>;

		/**
		 * Skips this test.
		 *
		 * @param message
		 * If provided, will be stored in this test's `skipped` property.
		 */
		skip(message?: string): void;

		toJSON(): Test.Serialized;
	}

	module Test {
		export interface Deferred<T> extends Promise.Deferred<T> {
			callback<U extends Function>(callback: U): U;
			rejectOnError<U extends Function>(callback: U): U;
		}

		export interface KwArgs {
			name: typeof Test.prototype.name;
			parent?: typeof Test.prototype.parent;
			timeout?: typeof Test.prototype.timeout;
			reporterManager?: typeof Test.prototype.reporterManager;
		}

		export interface Serialized {
			name: string;
			sessionId: string;
			id: string;
			timeout: number;
			timeElapsed: number;
			hasPassed: number;
			skipped: string;
			error: {
				name: string;
				message: string;
				stack: string;
			};
		}
	}

	export = Test;
}

declare module 'intern/lib/util' {
	import Promise = require('dojo/Promise');
	import Test = require('intern/lib/Test');
	import { IRequire } from 'dojo/loader';

	export interface InternError extends Chai.AssertionError {
		actual?: string;
		expected?: string;
		relatedTest?: Test;
	}

	export interface Deferred<T> extends Promise.Deferred<T> {
		callback(callback: (...args: any[]) => any): any;
		rejectOnError(callback: (...args: any[]) => any): any;
	}
	/**
	 * Creates a unified diff to explain the difference between two objects.
	 *
	 * @param actual The actual result.
	 * @param expected The expected result.
	 * @returns A unified diff formatted string representing the difference between the two objects.
	 */
	export function createDiff(actual: Object, expected: Object): string;

	export function assertSafeModuleId(moduleId: string): void;

	export function isAbsoluteUrl(url: string): boolean;

	/**
	 * Create a Deferred with some additional utility methods.
	 */
	export function createDeferred(): Deferred<any>;

	export interface Queuer {
		(callee: Function): () => void;
		empty?: () => void;
	}

	/**
	 * Creates a basic FIFO function queue to limit the number of currently executing asynchronous functions.
	 *
	 * @param maxConcurrency Number of functions to execute at once.
	 * @returns A function that can be used to push new functions onto the queue.
	 */
	export function createQueue(maxConcurrency: number): Function;

	/**
	 * Escape special characters in a regexp string
	 */
	export function escapeRegExp(str: any): string;

	/**
	 * Generates a full error message from a plain Error object, avoiding duplicate error messages that might be
	 * caused by different opinions on what a stack trace should look like.
	 *
	 * @param error An object describing the error.
	 * @returns A string message describing the error.
	 */
	export function getErrorMessage(error: string|Error|InternError): string;

	/**
	 * Return the module for a given module ID
	 */
	export function getModule(moduleId: string, loader?: IRequire): any;

	export function getShouldWait(waitMode: (string|boolean), message: string|any[]): boolean;

	/**
	 * Instrument a given file, saving its coverage source map.
	 *
	 * @param filedata Text of file being instrumented
	 * @param filepath Full path of file being instrumented
	 * @param instrumenterOptions Extra options for the instrumenter
	 *
	 * @returns {string} A string of instrumented code
	 */
	export function instrument(filedata: string, filepath: string, instrumenterOptions?: any): string;

	/**
	 * Return true if the module ID is a glob expression. This is similar to node-glob.hasMagic, but considers some
	 * special cases for AMD identifiers, like 'dojo/has!host-node?fs'.
	 */
	export function isGlobModuleId(moduleId: string): boolean;

	/**
	 * Normalize a path (e.g., resolve '..')
	 */
	export function normalizePath(path: string): string;

	/**
	 * Resolve a module ID that contains a glob expression.
	 */
	export function resolveModuleIds(moduleIds: string[]): string[];

	/**
	 * Run an async callback until it resolves, up to numRetries times
	 */
	export function retry(callback: Function, numRetries: number): Promise<any>;

	/**
	 * Creates a serialised representation of an object.
	 *
	 * @param object The object to serialise.
	 * @returns A canonical, serialised representation of the object.
	 */
	export function serialize(object: Object): string;

	/**
	 * Adds hooks for code coverage instrumentation in the Node.js loader.
	 *
	 * @param excludeInstrumentation A RegExp or boolean used to decide whether to apply
	 * instrumentation
	 * @param basePath The base path for all code
	 * @param instrumenterOptions Extra options for the instrumenter
	 */
	export function setInstrumentationHooks(excludeInstrumentation: (RegExp|boolean), basePath: string, instrumenterOptions: any): { remove: Function };
}
