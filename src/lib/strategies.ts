const STRATEGIES: any = [
	'class name',
	'css selector',
	'id',
	'name',
	'link text',
	'partial link text',
	'tag name',
	'xpath'
];

const SUFFIXES = STRATEGIES.map(function (strategy: string): string {
	return strategy.replace(/(?:^| )([a-z])/g, function (_, letter) {
		return letter.toUpperCase();
	});
});

STRATEGIES.suffixes = SUFFIXES;
STRATEGIES.applyTo = function (prototype: any) {
	STRATEGIES.forEach(function (strategy: string, index: number) {
		const suffix: string = SUFFIXES[index];

		prototype['findBy' + suffix] = function (value: any) {
			return this.find(strategy, value);
		};

		prototype['findDisplayedBy' + suffix] = function (value: any) {
			return this.findDisplayed(strategy, value);
		};

		prototype['waitForDeletedBy' + suffix] = function (value: any) {
			return this.waitForDeleted(strategy, value);
		};

		if (strategy !== 'id') {
			prototype['findAllBy' + suffix] = function (value: any) {
				return this.findAll(strategy, value);
			};
		}
	});
};

export default STRATEGIES;
