import { afterEach, describe, expect, it } from "vitest";

import EditorImprovementsPlugin from "../../src/main";
import { App, MarkdownView } from "../mocks/obsidian";
import { makeEditor, press, vimApi } from "../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

/** An editor open as a markdown view, the way Obsidian exposes it. */
function openEditor(app: App, doc: string) {
	const editor = makeEditor(doc);
	const view = Object.assign(editor.view, { cm: editor.cm });
	const markdown = new MarkdownView();
	markdown.editor = { cm: view };
	app.workspace.markdownViews.push(markdown);
	return { ...editor, markdown, text: () => editor.view.state.doc.toString() };
}

async function start() {
	const app = new App();
	app.vimEnabled = true;
	const first = openEditor(app, "alpha");
	const second = openEditor(app, "bravo");
	app.workspace.activeView = first.markdown;

	const plugin = new EditorImprovementsPlugin(app as never, {} as never);
	await plugin.onload();
	app.workspace.flushLayoutReady();
	plugin.settings.scriptsEnabled = true;
	await app.vault.adapter.mkdir(".obsidian/editor-improvements");
	await app.vault.adapter.write(
		".obsidian/editor-improvements/init.js",
		`vim.action("cut", (ctx) => ctx.view.dispatch({ changes: { from: 0, to: 1 } })); vim.nmap("gz", "cut");`,
	);
	await plugin.reloadScripts();
	return { app, first, second, plugin };
}

describe("an action runs on the editor that received the key", () => {
	it("when that is the active one", async () => {
		const t = await start();

		press(t.first.cm, "g", "z");

		expect(t.first.text()).toBe("lpha");
		expect(t.second.text()).toBe("bravo");
	});

	it("and not on whichever editor Obsidian calls active, when they differ", async () => {
		// Hover popovers and a second pane can take keys before Obsidian has moved
		// its idea of the active view; editing the other note would be worse than
		// doing nothing.
		const t = await start();

		press(t.second.cm, "g", "z");

		expect(t.second.text()).toBe("ravo");
		expect(t.first.text()).toBe("alpha");
	});

	it("falls back to the active editor when the key's editor is not an open markdown view", async () => {
		const t = await start();
		const stray = makeEditor("loose");
		t.app.workspace.activeView = t.first.markdown;
		vimApi.mapclear();
		await t.plugin.reloadScripts();

		press(stray.cm, "g", "z");

		expect(t.first.text()).toBe("lpha");
		expect(stray.view.state.doc.toString()).toBe("loose");
	});
});
