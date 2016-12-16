module.exports = {
	name: "Leadfoot",
	out: "tdoc",
	mode: "modules",
	tsconfig: "./tsconfig.json",
	target: "es5",
	includeDeclarations: true,
	ignoreCompilerErrors: true,
	excludePrivate: true,
	excludeExternals: true,
	excludeNotExported: true,
	exclude: 'types'
};
