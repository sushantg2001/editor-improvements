import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { createScriptApi } from "../../../src/scripts/api";
import { App } from "../../mocks/obsidian";
import { makeEditor, modeOf, press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

/** Runs a script body against `vim` and applies what it declared, as the plugin would. */
function setup(body: (vim: ReturnType<typeof createScriptApi>["api"]) => void, doc = "hello world") {
	const editor = makeEditor(doc);
	const registry = new ActionRegistry();
	const { api, contribution } = createScriptApi({
		app: new App() as never,
		getVim: () => vimApi,
		leader: "\\",
		knowsAction: () => false,
	});
	body(api);
	registry.set("script:init.js", contribution);
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings);
	return { ...editor, text: () => editor.view.state.doc.toString() };
}

describe("vim.map and vim.noremap without a mode, as :map and :noremap", () => {
	// In vim, :map covers normal, visual and operator-pending mode, and :map!
	// covers insert. A mapping like H -> ^ must not take over typing a capital H.
	it("does not take over a key while typing in insert mode", () => {
		const t = setup((vim) => vim.noremap("H", "<Esc>"));

		press(t.cm, "i");
		press(t.cm, "H");

		expect(modeOf(t.cm)).toBe("insert");
	});

	it("does the same for a recursive map", () => {
		const t = setup((vim) => vim.map("H", "<Esc>"));

		press(t.cm, "i");
		press(t.cm, "H");

		expect(modeOf(t.cm)).toBe("insert");
	});

	it("still applies in normal mode", () => {
		const t = setup((vim) => vim.noremap("Q", "x"));

		press(t.cm, "Q");

		expect(t.text()).toBe("ello world");
	});

	it("still applies in visual mode", () => {
		const t = setup((vim) => vim.noremap("Q", "d"));

		press(t.cm, "v", "l", "Q");

		expect(t.text()).toBe("llo world");
	});

	it("still applies after an operator", () => {
		const t = setup((vim) => vim.noremap("Q", "w"));

		press(t.cm, "d", "Q");

		expect(t.text()).toBe("world");
	});

	it("applies in insert mode when asked to, as imap does", () => {
		const t = setup((vim) => vim.imap("H", "<Esc>"));

		press(t.cm, "i");
		press(t.cm, "H");

		expect(modeOf(t.cm)).toBe("normal");
	});

	it("applies in insert mode when the contexts say so", () => {
		const t = setup((vim) => vim.noremap("H", "<Esc>", ["normal", "insert"]));

		press(t.cm, "i");
		press(t.cm, "H");

		expect(modeOf(t.cm)).toBe("normal");
	});
});
