import Element from '../Element';
import Promise = require('dojo/Promise');

export default class Strategies {
	find: (strategy: string, value: string) => Promise<Element>;
	findAll: (strategy: string, value: string) => Promise<Element[]>;
	findDisplayed: (strategy: string, value: string) => Promise<Element>;

	findByClassName(className: string): Promise<Element> {
		return this.find('class name', className);
	}
	findByCssSelector(selector: string): Promise<Element> {
		return this.find('css selector', selector);
	}
	findById(id: string): Promise<Element> {
		return this.find('id', id);
	}
	findByName(name: string): Promise<Element> {
		return this.find('name', name);
	}
	findByLinkText(text: string): Promise<Element> {
		return this.find('link text', text);
	}
	findByPartialLinkText(text: string): Promise<Element> {
		return this.find('partial link text', text);
	}
	findByTagName(tagName: string): Promise<Element> {
		return this.find('tag name', tagName);
	}
	findByXpath(path: string): Promise<Element> {
		return this.find('xpath', path);
	}

	findAllByClassName(className: string): Promise<Element[]> {
		return this.findAll('class name', className);
	}
	findAllByCssSelector(selector: string): Promise<Element[]> {
		return this.findAll('css selector', selector);
	}
	findAllByName(name: string): Promise<Element[]> {
		return this.findAll('name', name);
	}
	findAllByLinkText(text: string): Promise<Element[]> {
		return this.findAll('link text', text);
	}
	findAllByPartialLinkText(text: string): Promise<Element[]> {
		return this.findAll('partial link text', text);
	}
	findAllByTagName(tagName: string): Promise<Element[]> {
		return this.findAll('tag name', tagName);
	}
	findAllByXpath(path: string): Promise<Element[]> {
		return this.findAll('xpath', path);
	}

	findDisplayedByClassName(className: string): Promise<Element> {
		return this.findDisplayed('class name', className);
	}
	findDisplayedByCssSelector(selector: string): Promise<Element> {
		return this.findDisplayed('css selector', selector);
	}
	findDisplayedById(id: string): Promise<Element> {
		return this.findDisplayed('id', id);
	}
	findDisplayedByName(name: string): Promise<Element> {
		return this.findDisplayed('name', name);
	}
	findDisplayedByLinkText(text: string): Promise<Element> {
		return this.findDisplayed('link text', text);
	}
	findDisplayedByPartialLinkText(text: string): Promise<Element> {
		return this.findDisplayed('partial link text', text);
	}
	findDisplayedByTagName(tagName: string): Promise<Element> {
		return this.findDisplayed('tag name', tagName);
	}
	findDisplayedByXpath(path: string): Promise<Element> {
		return this.findDisplayed('xpath', path);
	}
}
