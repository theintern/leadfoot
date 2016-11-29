import Promise = require('dojo/Promise');
import { Url } from 'url';

export interface Capabilities {
	brokenActiveElement?: boolean;
	brokenComputedStyles?: boolean;
	brokenCssTransformedSize?: boolean;
	brokenDeleteCookie?: boolean;
	brokenDeleteWindow?: boolean;
	brokenDoubleClick?: boolean;
	brokenElementDisplayedOffscreen?: boolean;
	brokenElementDisplayedOpacity?: boolean;
	brokenElementPosition?: boolean;
	brokenExecuteUndefinedReturn?: boolean;
	brokenHtmlMouseMove?: boolean;
	brokenHtmlTagName?: boolean;
	brokenMouseEvents?: boolean;
	brokenNullGetSpecAttribute?: boolean;
	brokenPageSource?: boolean;
	brokenRefresh?: boolean;
	brokenSendKeys?: boolean;
	brokenSubmitElement?: boolean;
	brokenTouchScroll?: boolean;
	brokenWhitespaceNormalization?: boolean;
	brokenZeroTimeout?: boolean;
	browserName?: string;
	fixSessionCapabilities?: string|boolean;
	fixedLogTypes?: false|string[]|Promise<string[]>;
	implicitWindowHandles?: boolean;
	platform?: string;
	platformName?: string;
	remoteFiles?: boolean;
	returnsFromClickImmediately?: boolean;
	scriptedParentFrameCrashesBrowser?: boolean;
	supportsKeysCommand?: boolean;
	touchEnabled?: boolean;
	supportsNavigationDataUris?: boolean;
	version?: string;
	initialBrowserUrl?: string;
	browserVersion?: string;
	handleAlerts?: boolean;
	locationContextEnabled?: boolean;
	webStorageEnabled?: boolean;
	applicationCacheEnabled?: boolean;
	hasTouchScreen?: boolean;
	deviceName?: string;
	mouseEnabled?: boolean;
	supportsCssTransforms?: boolean;
	supportsExecuteAsync?: boolean;
	brokenNavigation?: boolean;
	brokenExecuteElementReturn?: boolean;
	takesScreenshot?: boolean;
	brokenParentFrameSwitch?: boolean;
	brokenWindowSwitch?: boolean;
	brokenWindowClose?: boolean;
	dynamicViewport?: boolean;
	brokenWindowPosition?: boolean;
	brokenWindowSize?: boolean;
	brokenCookies?: boolean;
	brokenElementSerialization?: boolean;
	handlesAlerts?: boolean;
	brokenMoveFinger?: boolean;
	brokenLongTap?: boolean;
	brokenFlickFinger?: boolean;
	rotatable?: boolean;
	_filled?: boolean;
	brokenFileSendKeys?: boolean;
	brokenOptionSelect?: boolean;
}

export interface GeoLocation {
	altitude?: number;
	latitude?: number;
	longitude?: number;
}

export interface LogEntry {
	timestamp: number;
	level: string;
	message: string;
}

export interface Thenable<T> {
	then<U>(onFulfilled?: (value?: T) => Thenable<U> | U, onRejected?: (error?: Error) => Thenable<U> | U): Thenable<U>;
}

export interface WebDriverCookie {
	name: string;
	value: string;
	path?: string;
	domain?: string;
	secure?: boolean;
	expiry?: string|Date|number;
}

export interface LeadfootURL extends Url {
	username?: string;
	password?: string;
	accessKey?: string;
}
