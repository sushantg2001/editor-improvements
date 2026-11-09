import { afterEach, describe, expect, it } from "vitest";

import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { VimDispatcher } from "../../../src/core/dispatch";
import { ScriptHost } from "../../../src/scripts/loader";
import { scaffoldScripts } from "../../../src/scripts/scaffold";
import { App } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";

const FOLDER = ".obsidian/vim-tools";

afterEach(() => {
	vimApi.mapclear();
});

/**
 * Runs a script through the real loader and applies whatever it configured to
 * a real CodeMirror editor with the real vim extension — the full path a user
 * actually exercises.
 */
async function runScript(code: string, doc = "alpha\nbravo\ncharlie") {
	const editor = makeEditor(doc);
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, code);

	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher(app as never, registry, () => editor.ctx, () => vimApi);
	const ledger = new MappingLedger();

	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => vimApi,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});

	const result = await host.reload();
	const { bindings, conflicts } = resolveBindings(registry);
	ledger.apply(vimApi, dispatcher, bindings, registry.unmaps());

	return { ...editor, registry, ledger, result, conflicts, host, app };
}

describe("a script configuring real vim", () => {
	it("applies a plain remap", async () => {
		const { cm, view } = await runScript(`vim.nnoremap("Q", "dd");`);

		press(cm, "Q");

		expect(view.state.doc.toString()).toBe("bravo\ncharlie");
	});

	it("applies an insert-mode remap", async () => {
		const { cm } = await runScript(`vim.inoremap("jk", "<Esc>");`);

		press(cm, "i");
		expect(cm.state.vim?.insertMode).toBe(true);

		press(cm, "j", "k");
		expect(cm.state.vim?.insertMode).toBe(false);
	});

	it("runs an action bound by the script", async () => {
		const { cm, registry } = await runScript(`
			let hits = 0;
			vim.action("count", () => { hits += 1; globalThis.__hits = hits; });
			vim.nmap("gz", "count");
		`);

		press(cm, "g", "z");

		expect(registry.get("count")).toBeTruthy();
		expect((globalThis as Record<string, unknown>).__hits).toBe(1);
	});

	it("expands <leader> so the mapped key is the expanded one", async () => {
		const { cm, view } = await runScript(`
			vim.leader(" ");
			vim.nunmap("<Space>");
			vim.nnoremap("<leader>d", "dd");
		`);

		// The key arrives as <Space>, as it does from a keyboard.
		press(cm, "<Space>", "d");

		expect(view.state.doc.toString()).toBe("bravo\ncharlie");
	});

	it("makes a script-defined motion compose with an operator", async () => {
		// The end-to-end version of the operatorPending finding: a motion
		// defined in userland must work after `d`, not just on its own.
		const { cm, view } = await runScript(`
			vim.motion("toEnd", (ctx) => ({ line: 2, ch: 0 }));
			vim.nmap("gz", "toEnd");
		`);

		press(cm, "d", "g", "z");

		expect(view.state.doc.toString()).not.toContain("alpha");
	});

	it("hands the typed count to the action as repeat", async () => {
		const { cm } = await runScript(`
			vim.action("rec", (ctx, args) => { globalThis.__repeat = args.repeat; });
			vim.nmap("gz", "rec");
		`);

		press(cm, "4", "g", "z");

		expect((globalThis as Record<string, unknown>).__repeat).toBe(4);
	});

	it("hands every key back when the ledger is cleared", async () => {
		const { cm, view, ledger } = await runScript(`vim.nnoremap("Q", "dd");`);

		ledger.clear(vimApi);
		press(cm, "Q");

		expect(view.state.doc.toString()).toBe("alpha\nbravo\ncharlie");
	});

	it("reports a key two scripts disagree about", async () => {
		const editor = makeEditor("alpha");
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.nnoremap("Q", "dd");`);
		app.vault.adapter.files.set(`${FOLDER}/other.js`, `vim.nnoremap("Q", "yy");`);

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
		const { conflicts } = resolveBindings(registry);

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.sources).toEqual(["script:init.js", "script:other.js"]);
		expect(conflicts[0]?.winner).toBe("keys:yy");
		void editor;
	});

	it("applies the second version of a script after a reload", async () => {
		const { app, host, registry, cm, view, ledger } = await runScript(
			`vim.nnoremap("Q", "dd");`,
		);

		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.nnoremap("Q", "yy");`);
		await host.reload();
		const dispatcher = new VimDispatcher(app as never, registry, () => null, () => vimApi);
		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);

		press(cm, "Q");

		// `yy` yanks rather than deletes, so the document is untouched.
		expect(view.state.doc.toString()).toBe("alpha\nbravo\ncharlie");
	});
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
