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

	/**
	 * Gets the first element inside this element matching the given CSS class name.
	 *
	 * @param className The CSS class name to search for.
	 */
	findByClassName(className: string): E {
		return this.find('class name', className);
	}

	/**
	 * Gets the first element inside this element matching the given CSS selector.
	 *
	 * @param selector The CSS selector to search for.
	 */
	findByCssSelector(selector: string): E {
		return this.find('css selector', selector);
	}

	/**
	 * Gets the first element inside this element matching the given ID.
	 *
	 * @param id The ID of the element.
	 */
	findById(id: string): E {
		return this.find('id', id);
	}

	/**
	 * Gets the first element inside this element matching the given name attribute.
	 *
	 * @param name The name of the element.
	 */
	findByName(name: string): E {
		return this.find('name', name);
	}

	/**
	 * Gets the first element inside this element matching the given case-insensitive link text.
	 *
	 * @param text The link text of the element.
	 */
	findByLinkText(text: string): E {
		return this.find('link text', text);
	}

	/**
	 * Gets the first element inside this element partially matching the given case-insensitive link text.
	 *
	 * @param text The partial link text of the element.
	 */
	findByPartialLinkText(text: string): E {
		return this.find('partial link text', text);
	}

	/**
	 * Gets the first element inside this element matching the given HTML tag name.
	 *
	 * @param tagName The tag name of the element.
	 */
	findByTagName(tagName: string): E {
		return this.find('tag name', tagName);
	}

	/**
	 * Gets the first element inside this element matching the given XPath selector.
	 *
	 * @param path The XPath selector to search for.
	 */
	findByXpath(path: string): E {
		return this.find('xpath', path);
	}

	/**
	 * Gets all elements inside this element matching the given CSS class name.
	 *
	 * @param className The CSS class name to search for.
	 */
	findAllByClassName(className: string): L {
		return this.findAll('class name', className);
	}

	/**
	 * Gets all elements inside this element matching the given CSS selector.
	 *
	 * @param selector The CSS selector to search for.
	 */
	findAllByCssSelector(selector: string): L {
		return this.findAll('css selector', selector);
	}

	/**
	 * Gets all elements inside this element matching the given name attribute.
	 *
	 * @param name The name of the element.
	 */
	findAllByName(name: string): L {
		return this.findAll('name', name);
	}

	/**
	 * Gets all elements inside this element matching the given case-insensitive link text.
	 *
	 * @param text The link text of the element.
	 */
	findAllByLinkText(text: string): L {
		return this.findAll('link text', text);
	}

	/**
	 * Gets all elements inside this element partially matching the given case-insensitive link text.
	 *
	 * @param text The partial link text of the element.
	 */
	findAllByPartialLinkText(text: string): L {
		return this.findAll('partial link text', text);
	}

	/**
	 * Gets all elements inside this element matching the given HTML tag name.
	 *
	 * @param tagName The tag name of the element.
	 */
	findAllByTagName(tagName: string): L {
		return this.findAll('tag name', tagName);
	}

	/**
	 * Gets all elements inside this element matching the given XPath selector.
	 *
	 * @param path The XPath selector to search for.
	 */
	findAllByXpath(path: string): L {
		return this.findAll('xpath', path);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given CSS class name. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param className The CSS class name to search for.
	 */
	findDisplayedByClassName(className: string): E {
		return this.findDisplayed('class name', className);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given CSS selector. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param selector The CSS selector to search for.
	 */
	findDisplayedByCssSelector(selector: string): E {
		return this.findDisplayed('css selector', selector);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given ID. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param id The ID of the element.
	 */
	findDisplayedById(id: string): E {
		return this.findDisplayed('id', id);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given name attribute. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param name The name of the element.
	 */
	findDisplayedByName(name: string): E {
		return this.findDisplayed('name', name);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given case-insensitive link text. This is inherently slower than [[Element.find]],
	 * so should only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param text The link text of the element.
	 */
	findDisplayedByLinkText(text: string): E {
		return this.findDisplayed('link text', text);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * partially matching the given case-insensitive link text. This is inherently slower than
	 * [[Element.find]], so should only be used in cases where the visibility of an element cannot be
	 * ensured in advance.
	 *
	 * @since 1.6
	 * @param text The partial link text of the element.
	 */
	findDisplayedByPartialLinkText(text: string): E {
		return this.findDisplayed('partial link text', text);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given HTML tag name. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param tagName The tag name of the element.
	 */
	findDisplayedByTagName(tagName: string): E {
		return this.findDisplayed('tag name', tagName);
	}

	/**
	 * Gets the first [[Element.isDisplayed displayed]] element inside this element
	 * matching the given XPath selector. This is inherently slower than [[Element.find]], so should
	 * only be used in cases where the visibility of an element cannot be ensured in advance.
	 *
	 * @since 1.6
	 * @param path The XPath selector to search for.
	 */
	findDisplayedByXpath(path: string): E {
		return this.findDisplayed('xpath', path);
	}

	/**
	 * Waits for all elements inside this element matching the given CSS class name to be destroyed.
	 *
	 * @param className The CSS class name to search for.
	 */
	waitForDeletedByClassName(className: string): V {
		return this.waitForDeleted('class name', className);
	}

	/**
	 * Waits for all elements inside this element matching the given CSS selector to be destroyed.
	 *
	 * @param selector The CSS selector to search for.
	 */
	waitForDeletedByCssSelector(selector: string): V {
		return this.waitForDeleted('css selector', selector);
	}

	/**
	 * Waits for all elements inside this element matching the given ID to be destroyed.
	 *
	 * @param id The ID of the element.
	 */
	waitForDeletedById(id: string): V {
		return this.waitForDeleted('id', id);
	}

	/**
	 * Waits for all elements inside this element matching the given name attribute to be destroyed.
	 *
	 * @param name The name of the element.
	 */
	waitForDeletedByName(name: string): V {
		return this.waitForDeleted('name', name);
	}

	/**
	 * Waits for all elements inside this element matching the given case-insensitive link text to be destroyed.
	 *
	 * @param text The link text of the element.
	 */
	waitForDeletedByLinkText(text: string): V {
		return this.waitForDeleted('link text', text);
	}

	/**
	 * Waits for all elements inside this element partially matching the given case-insensitive link text to be
	 * destroyed.
	 *
	 * @param text The partial link text of the element.
	 */
	waitForDeletedByPartialLinkText(text: string): V {
		return this.waitForDeleted('partial link text', text);
	}

	/**
	 * Waits for all elements inside this element matching the given HTML tag name to be destroyed.
	 *
	 * @param tagName The tag name of the element.
	 */
	waitForDeletedByTagName(tagName: string): V {
		return this.waitForDeleted('tag name', tagName);
	}

	/**
	 * Waits for all elements inside this element matching the given XPath selector to be destroyed.
	 *
	 * @param path The XPath selector to search for.
	 */
	waitForDeletedByXpath(path: string): V {
		return this.waitForDeleted('xpath', path);
	}
}

export default Strategies;
