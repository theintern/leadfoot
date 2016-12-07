// Note that these are JSONWireProtocol strategies. W3C Webdriver only understands 4 strategies:
//   1. css selector
//   2. link text
//   3. partial link text
//   4. xpath
export const strategies = [
	'class name',
	'css selector',
	'id',
	'name',
	'link text',
	'partial link text',
	'tag name',
	'xpath'
];

export const suffixes = strategies.map(function (strategy) {
	return strategy.replace(/(?:^| )([a-z])/g, function (_, letter) {
		return letter.toUpperCase();
	});
});

abstract class Strategies<E, L, V> {
	abstract find(strategy: string, value: string): E;
	abstract findAll(strategy: string, value: string): L;
	abstract findDisplayed(strategy: string, value: string): E;
	abstract waitForDeleted(strategy: string, value: string): V;

	findByClassName(className: string): E {
		return this.find('class name', className);
	}
	findByCssSelector(selector: string): E {
		return this.find('css selector', selector);
	}
	findById(id: string): E {
		return this.find('id', id);
	}
	findByName(name: string): E {
		return this.find('name', name);
	}
	findByLinkText(text: string): E {
		return this.find('link text', text);
	}
	findByPartialLinkText(text: string): E {
		return this.find('partial link text', text);
	}
	findByTagName(tagName: string): E {
		return this.find('tag name', tagName);
	}
	findByXpath(path: string): E {
		return this.find('xpath', path);
	}

	findAllByClassName(className: string): L {
		return this.findAll('class name', className);
	}
	findAllByCssSelector(selector: string): L {
		return this.findAll('css selector', selector);
	}
	findAllByName(name: string): L {
		return this.findAll('name', name);
	}
	findAllByLinkText(text: string): L {
		return this.findAll('link text', text);
	}
	findAllByPartialLinkText(text: string): L {
		return this.findAll('partial link text', text);
	}
	findAllByTagName(tagName: string): L {
		return this.findAll('tag name', tagName);
	}
	findAllByXpath(path: string): L {
		return this.findAll('xpath', path);
	}

	findDisplayedByClassName(className: string): E {
		return this.findDisplayed('class name', className);
	}
	findDisplayedByCssSelector(selector: string): E {
		return this.findDisplayed('css selector', selector);
	}
	findDisplayedById(id: string): E {
		return this.findDisplayed('id', id);
	}
	findDisplayedByName(name: string): E {
		return this.findDisplayed('name', name);
	}
	findDisplayedByLinkText(text: string): E {
		return this.findDisplayed('link text', text);
	}
	findDisplayedByPartialLinkText(text: string): E {
		return this.findDisplayed('partial link text', text);
	}
	findDisplayedByTagName(tagName: string): E {
		return this.findDisplayed('tag name', tagName);
	}
	findDisplayedByXpath(path: string): E {
		return this.findDisplayed('xpath', path);
	}

	waitForDeletedByClassName(className: string): V {
		return this.waitForDeleted('class name', className);
	}
	waitForDeletedByCssSelector(selector: string): V {
		return this.waitForDeleted('css selector', selector);
	}
	waitForDeletedById(id: string): V {
		return this.waitForDeleted('id', id);
	}
	waitForDeletedByName(name: string): V {
		return this.waitForDeleted('name', name);
	}
	waitForDeletedByLinkText(text: string): V {
		return this.waitForDeleted('link text', text);
	}
	waitForDeletedByPartialLinkText(text: string): V {
		return this.waitForDeleted('partial link text', text);
	}
	waitForDeletedByTagName(tagName: string): V {
		return this.waitForDeleted('tag name', tagName);
	}
	waitForDeletedByXpath(path: string): V {
		return this.waitForDeleted('xpath', path);
	}
}

export default Strategies;
