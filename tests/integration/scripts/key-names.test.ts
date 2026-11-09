import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { scaffoldScripts } from "../../../src/scripts/scaffold";
import { App } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";

const FOLDER = ".obsidian/vim-tools";

afterEach(() => {
	vimApi.mapclear();
});

describe("key spellings a script can use, against the real addon", () => {
	/** Runs `script` as an init.js and returns the editor, ready for key presses. */
	async function run(script: string, doc = "hello") {
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
		const dispatcher = new VimDispatcher(
			app as never,
			registry,
			() => editor.ctx,
			() => vimApi,
		);
		new MappingLedger().apply(
			vimApi,
			dispatcher,
			resolveBindings(registry).bindings,
			registry.unmaps(),
		);
		return { ...editor, text: () => editor.view.state.doc.toString() };
	}

	it("a literal space leader fires on the Space key", async () => {
		const t = await run(`vim.leader(" "); vim.nunmap("<Space>"); vim.nnoremap("<leader>d", "x");`);

		press(t.cm, "<Space>", "d");

		expect(t.text()).toBe("ello");
	});

	it("<space> in lower case fires on the Space key", async () => {
		const t = await run(`vim.nunmap("<Space>"); vim.nnoremap("<space>d", "x");`);

		press(t.cm, "<Space>", "d");

		expect(t.text()).toBe("ello");
	});

	it.each([
		["<lt>", "<"],
		["<Bar>", "|"],
		["<Bslash>", "\\"],
	])("%s fires on the character it names", async (name, character) => {
		const t = await run(`vim.nunmap("${character === "\\" ? "\\\\" : character}"); vim.nnoremap("g${name}", "x");`);

		press(t.cm, "g", character);

		expect(t.text()).toBe("ello");
	});

	// Every way a script might spell a key, and the key press that must reach it.
	// A plain remap is matched against the addon's own name for the key, so a
	// spelling it does not normalise is dead without any error.
	it.each([
		["<cr>", "<CR>"],
		["<Enter>", "<CR>"],
		["<Return>", "<CR>"],
		["<esc>", "<Esc>"],
		["<tab>", "<Tab>"],
		["<bs>", "<BS>"],
		["<c-h>", "<C-h>"],
		["<C-H>", "<C-h>"],
		["<a-j>", "<A-j>"],
		["<up>", "<Up>"],
		["<Delete>", "<Del>"],
		["<S-tab>", "<S-Tab>"],
		["<c-space>", "<C-Space>"],
	])("%s fires on the %s key", async (written, pressed) => {
		const t = await run(`vim.nnoremap(${JSON.stringify(written)}, "x");`);

		press(t.cm, pressed);

		expect(t.text()).toBe("ello");
	});

	it("a literal tab and newline fire on the Tab and Enter keys", async () => {
		const t = await run(`vim.nnoremap("\\t", "x"); vim.nnoremap("\\n", "x");`);

		press(t.cm, "<Tab>");
		press(t.cm, "<CR>");

		expect(t.text()).toBe("llo");
	});

	it("the starter script's leader opens today's note", async () => {
		// What a new user is told to do first. It used to bind a key nothing could press.
		const editor = makeEditor("hello");
		const app = new App();
		const executed: string[] = [];
		(app as unknown as { commands: unknown }).commands = {
			executeCommandById: (id: string) => (executed.push(id), true),
		};
		await scaffoldScripts(app as never, FOLDER);
		const registry = new ActionRegistry();
		await new ScriptHost({
			app: app as never,
			registry,
			getVim: () => vimApi,
			isEnabled: () => true,
			getFolder: () => FOLDER,
			getLeader: () => "\\",
		}).reload();
		const dispatcher = new VimDispatcher(
			app as never,
			registry,
			() => editor.ctx,
			() => vimApi,
		);
		new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings, registry.unmaps());

		press(editor.cm, "<Space>", "d");

		expect(executed).toEqual(["daily-notes"]);
	});
});
