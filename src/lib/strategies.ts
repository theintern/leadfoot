import { Thenable } from '../interfaces';
import Element from '../Element';

// Note that these are JSONWireProtocol strategies. W3C Webdriver only understands 4 strategies:
//   1. css selector
//   2. link text
//   3. partial link text
//   4. xpath
const STRATEGIES = [
	'class name',
	'css selector',
	'id',
	'name',
	'link text',
	'partial link text',
	'tag name',
	'xpath'
];

export const suffixes = STRATEGIES.map(function (strategy) {
	return strategy.replace(/(?:^| )([a-z])/g, function (_, letter) {
		return letter.toUpperCase();
	});
});

export default class Strategies {
	find: (strategy: string, value: string) => Thenable<Element>;
	findAll: (strategy: string, value: string) => Thenable<Element[]>;
	findDisplayed: (strategy: string, value: string) => Thenable<Element>;
	waitForDeleted: (strategy: string, value: string) => Thenable<void>;

	findByClassName(className: string): Thenable<Element> {
		return this.find('class name', className);
	}
	findByCssSelector(selector: string): Thenable<Element> {
		return this.find('css selector', selector);
	}
	findById(id: string): Thenable<Element> {
		return this.find('id', id);
	}
	findByName(name: string): Thenable<Element> {
		return this.find('name', name);
	}
	findByLinkText(text: string): Thenable<Element> {
		return this.find('link text', text);
	}
	findByPartialLinkText(text: string): Thenable<Element> {
		return this.find('partial link text', text);
	}
	findByTagName(tagName: string): Thenable<Element> {
		return this.find('tag name', tagName);
	}
	findByXpath(path: string): Thenable<Element> {
		return this.find('xpath', path);
	}

	findAllByClassName(className: string): Thenable<Element[]> {
		return this.findAll('class name', className);
	}
	findAllByCssSelector(selector: string): Thenable<Element[]> {
		return this.findAll('css selector', selector);
	}
	findAllByName(name: string): Thenable<Element[]> {
		return this.findAll('name', name);
	}
	findAllByLinkText(text: string): Thenable<Element[]> {
		return this.findAll('link text', text);
	}
	findAllByPartialLinkText(text: string): Thenable<Element[]> {
		return this.findAll('partial link text', text);
	}
	findAllByTagName(tagName: string): Thenable<Element[]> {
		return this.findAll('tag name', tagName);
	}
	findAllByXpath(path: string): Thenable<Element[]> {
		return this.findAll('xpath', path);
	}

	findDisplayedByClassName(className: string): Thenable<Element> {
		return this.findDisplayed('class name', className);
	}
	findDisplayedByCssSelector(selector: string): Thenable<Element> {
		return this.findDisplayed('css selector', selector);
	}
	findDisplayedById(id: string): Thenable<Element> {
		return this.findDisplayed('id', id);
	}
	findDisplayedByName(name: string): Thenable<Element> {
		return this.findDisplayed('name', name);
	}
	findDisplayedByLinkText(text: string): Thenable<Element> {
		return this.findDisplayed('link text', text);
	}
	findDisplayedByPartialLinkText(text: string): Thenable<Element> {
		return this.findDisplayed('partial link text', text);
	}
	findDisplayedByTagName(tagName: string): Thenable<Element> {
		return this.findDisplayed('tag name', tagName);
	}
	findDisplayedByXpath(path: string): Thenable<Element> {
		return this.findDisplayed('xpath', path);
	}

	waitForDeletedByClassName(className: string): Thenable<void> {
		return this.waitForDeleted('class name', className);
	}
	waitForDeletedByCssSelector(selector: string): Thenable<void> {
		return this.waitForDeleted('css selector', selector);
	}
	waitForDeletedById(id: string): Thenable<void> {
		return this.waitForDeleted('id', id);
	}
	waitForDeletedByName(name: string): Thenable<void> {
		return this.waitForDeleted('name', name);
	}
	waitForDeletedByLinkText(text: string): Thenable<void> {
		return this.waitForDeleted('link text', text);
	}
	waitForDeletedByPartialLinkText(text: string): Thenable<void> {
		return this.waitForDeleted('partial link text', text);
	}
	waitForDeletedByTagName(tagName: string): Thenable<void> {
		return this.waitForDeleted('tag name', tagName);
	}
	waitForDeletedByXpath(path: string): Thenable<void> {
		return this.waitForDeleted('xpath', path);
	}
}
