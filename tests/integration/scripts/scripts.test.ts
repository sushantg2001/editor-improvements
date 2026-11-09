import { afterEach, describe, expect, it } from "vitest";

import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { VimDispatcher } from "../../../src/core/dispatch";
import { ScriptHost } from "../../../src/scripts/loader";
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
	ledger.apply(vimApi, dispatcher, bindings);

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
			vim.nnoremap("<leader>d", "dd");
		`);

		press(cm, " ", "d");

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
