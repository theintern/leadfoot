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
	fixedLogTypes?: string[];
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
}

export interface GeoLocation {
	altitude: number;
}

export interface LogEntry {
	timestamp: number;
	level: string;
	message: string;
}

interface WebDriverCookie {
	name: string;
	value: string;
	path?: string;
	domain?: string;
	secure?: boolean;
	expiry?: string|Date|number;
}
