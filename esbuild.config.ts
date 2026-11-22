// Builds main.js for Obsidian: one CommonJS bundle, with everything Obsidian
// provides at runtime left external.
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// The MIT licenses require their notices in every copy of the bundled code.
const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8").replaceAll("*/", "* /");

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	outfile: "main.js",
	bundle: true,
	format: "cjs",
	target: "es2022",
	// Obsidian serves these through its own require. Node built-ins stay
	// external so desktop-only modules can import them dynamically.
	external: [
		"obsidian",
		"electron",
		"@electron/remote",
		"@codemirror/*",
		"@lezer/*",
		...builtinModules,
		...builtinModules.map((name) => `node:${name}`),
	],
	minify: production,
	sourcemap: production ? false : "inline",
	treeShaking: true,
	banner: { js: `/*\n${notices}*/` },
	logLevel: "info",
});

if (watch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
