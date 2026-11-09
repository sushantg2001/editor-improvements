import * as codemirrorState from "@codemirror/state";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import * as obsidianDouble from "../mocks/obsidian";
import { makeEditor, press, vimApi } from "../helpers/vim";

/**
 * The plugin as it is shipped: `src/main.ts` bundled with the release build's
 * options, then loaded the way Obsidian loads `main.js`. Every other test
 * imports the sources, so a problem that only the bundler creates (a stripped
 * import, a changed class field, a missing external) would pass them all and
 * break for the people who install the plugin.
 */

/** The externals the release build declares, read from its config so they cannot drift. */
function releaseExternals(): string[] {
	const config = readFileSync("esbuild.config.mjs", "utf8");
	const block = /external:\s*\[([\s\S]*?)\]/.exec(config)?.[1] ?? "";
	return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? "");
}

type PluginClass = new (app: unknown, manifest: unknown) => {
	onload(): Promise<void>;
	onunload?(): void;
	unload(): void;
	commands: { id: string; editorCheckCallback?: (checking: boolean) => boolean; callback?: () => void }[];
};

let code = "";

beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/main.ts"],
		bundle: true,
		external: releaseExternals(),
		format: "cjs",
		target: "es2021",
		minify: true,
		treeShaking: true,
		write: false,
		logLevel: "silent",
	});
	code = result.outputFiles[0]?.text ?? "";
});

/** Evaluates the bundle with the test doubles standing in for what Obsidian provides. */
function loadBundle(): { default: PluginClass } {
	const modules: Record<string, unknown> = {
		obsidian: obsidianDouble,
		"@codemirror/state": codemirrorState,
	};
	const module = { exports: {} as { default: PluginClass } };
	const required: string[] = [];
	const requireModule = (name: string): unknown => {
		required.push(name);
		if (!(name in modules)) {
			throw new Error(`the bundle needs "${name}", which the release does not provide`);
		}
		return modules[name];
	};
	new Function("module", "exports", "require", code)(module, module.exports, requireModule);
	loadBundle.required = required;
	return module.exports;
}
loadBundle.required = [] as string[];

describe("the release bundle", () => {
	it("is a single file that asks only for what Obsidian provides", () => {
		loadBundle();

		expect(new Set(loadBundle.required)).toEqual(new Set(["obsidian", "@codemirror/state"]));
	});

	it("exports the plugin class", () => {
		expect(typeof loadBundle().default).toBe("function");
	});

	it("loads, registers its commands and runs one on a real editor", async () => {
		const { default: Plugin } = loadBundle();
		const editor = makeEditor("alpha\nbravo");
		const app = new obsidianDouble.App();
		app.vimEnabled = true;
		const view = Object.assign(editor.view, { cm: editor.cm });
		const markdown = new obsidianDouble.MarkdownView();
		markdown.editor = { cm: view };
		app.workspace.activeView = markdown;

		const plugin = new Plugin(app, {});
		await plugin.onload();
		app.workspace.flushLayoutReady();

		const ids = plugin.commands.map((c) => c.id);
		for (const id of ["reload-config", "show-status", "selectAll", "insertLineBelow", "goToNextWord"]) {
			expect(ids, id).toContain(id);
		}
		const command = plugin.commands.find((c) => c.id === "insertLineBelow");
		command?.editorCheckCallback?.(false);
		expect(editor.view.state.doc.toString()).toBe("alpha\n\nbravo");
	});

	it("applies a script and hands its keys back on unload", async () => {
		const { default: Plugin } = loadBundle();
		const editor = makeEditor("hello");
		const app = new obsidianDouble.App();
		app.vimEnabled = true;
		const view = Object.assign(editor.view, { cm: editor.cm });
		const markdown = new obsidianDouble.MarkdownView();
		markdown.editor = { cm: view };
		app.workspace.activeView = markdown;
		const plugin = new Plugin(app, {});
		await plugin.onload();
		app.workspace.flushLayoutReady();
		await app.vault.adapter.mkdir(".obsidian/vim-tools");
		await app.vault.adapter.write(".obsidian/vim-tools/init.js", `vim.nnoremap("gz", "x");`);
		(plugin as unknown as { settings: { scriptsEnabled: boolean } }).settings.scriptsEnabled = true;
		await (plugin as unknown as { reloadScripts(): Promise<void> }).reloadScripts();

		press(editor.cm, "g", "z");
		expect(editor.view.state.doc.toString()).toBe("ello");

		plugin.unload();
		press(editor.cm, "g", "z");
		expect(editor.view.state.doc.toString()).toBe("ello");
		vimApi.mapclear();
	});
});
