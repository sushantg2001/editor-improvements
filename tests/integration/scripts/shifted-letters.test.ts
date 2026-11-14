import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";

const FOLDER = ".obsidian/editor-improvements";

afterEach(() => {
	vimApi.mapclear();
});

/**
 * The editor names a key event before it looks for a mapping: Ctrl+Shift+x is
 * `<C-S-X>`, with a capital, and Shift+x is just `X`. A mapping written
 * `<C-S-x>` or `<S-x>` has to end up under those names to fire.
 */
async function run(script: string, doc = "one\ntwo\nthree") {
	const editor = makeEditor(doc);
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, script);
	const registry = new ActionRegistry();
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => vimApi,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const result = await host.reload();
	expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
	const dispatcher = new VimDispatcher(app as never, registry, () => editor.ctx, () => vimApi);
	new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings, registry.unmaps());
	return { ...editor, text: () => editor.view.state.doc.toString() };
}

describe("a mapping on a shifted letter", () => {
	it.each(["<C-S-x>", "<C-S-X>", "<S-C-x>"])("written %s fires on Ctrl+Shift+x", async (written) => {
		const t = await run(`vim.nnoremap("${written}", "dd");`);

		press(t.cm, "<C-S-X>");

		expect(t.text()).toBe("two\nthree");
	});

	it.each(["<S-x>", "<S-X>"])("written %s fires on Shift+x, which is the key X", async (written) => {
		const t = await run(`vim.nnoremap("${written}", "dd");`);

		press(t.cm, "X");

		expect(t.text()).toBe("two\nthree");
	});

	it("does not fire on the unshifted letter", async () => {
		const t = await run(`vim.nnoremap("<C-S-x>", "dd");`);

		press(t.cm, "<C-x>");

		expect(t.text()).toBe("one\ntwo\nthree");
	});
});
