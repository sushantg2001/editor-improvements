import { afterEach, beforeEach, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";

const FOLDER = ".obsidian/editor-improvements";

beforeEach(() => {
	Notice.messages.length = 0;
});

afterEach(() => {
	vimApi.mapclear();
});

it.each(["null", "undefined", "{}", "{ unrelated: 1 }", "5", '"text"', "true"])(
	"a motion that returns %s stays put without a complaint",
	async (returns) => {
		const editor = makeEditor("one two");
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.motion("m", () => (${returns})); vim.nmap("gq", "m");`);
		const registry = new ActionRegistry();
		const host = new ScriptHost({
			app: app as never,
			registry,
			getVim: () => vimApi,
			isEnabled: () => true,
			getFolder: () => FOLDER,
			getLeader: () => "\\",
		});
		await host.reload();
		const dispatcher = new VimDispatcher(app as never, registry, () => editor.ctx, () => vimApi);
		new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(editor.cm, "l");
		const before = editor.view.state.selection.main.head;

		press(editor.cm, "g", "q");

		expect(editor.view.state.selection.main.head).toBe(before);
		expect(Notice.messages).toEqual([]);
	},
);
