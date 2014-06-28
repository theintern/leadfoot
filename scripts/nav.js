/* jshint browser:true */
(function () {
	var source = document.querySelectorAll('.prettyprint.source.linenums');

	if (source.length) {
		var lines = source[0].getElementsByTagName('li');
		var totalLines = lines.length;
		var currentLine;

		for (var i = 0; i < totalLines; ++i) {
			lines[i].id = 'line' + (i + 1);
		}

		var updateHighlight = function () {
			var anchorHash = location.hash.slice(1);
			currentLine && currentLine.classList.remove('selected');

			currentLine = document.getElementById(anchorHash);
			currentLine && currentLine.classList.add('selected');
		};

		window.addEventListener('hashchange', updateHighlight, false);
		updateHighlight();
	}
})();

(function () {
	// Displays the title of the page fixed in the header as it scrolls away
	var content = document.querySelector('.mainContent');
	var pageTitle = document.querySelector('.persistentTitle');
	var sectionTitle = document.querySelector('.title');

	if (content && pageTitle && sectionTitle) {
		var offset = (function () {
			var parent = sectionTitle;
			var offset = sectionTitle.offsetTop;

			while ((parent = parent.offsetParent)) {
				offset += parent.offsetTop;
			}

			return offset + sectionTitle.offsetHeight - pageTitle.offsetHeight;
		})();

		var updateTitle = function () {
			pageTitle.classList[content.scrollTop >= offset ? 'remove' : 'add']('hidden');
		};

		content.addEventListener('scroll', updateTitle, false);
		updateTitle();
	}
})();
