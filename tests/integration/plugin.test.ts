import { afterEach, describe, expect, it } from "vitest";

import EditorImprovementsPlugin from "../../src/main";
import { MODULES } from "../../src/modules";
import { App, MarkdownView, Notice } from "../mocks/obsidian";
import { makeEditor, press, vimApi } from "../helpers/vim";

/**
 * The whole plugin, wired by `main.ts`, on a real editor with the real vim
 * addon. Nothing here is stubbed except Obsidian itself.
 */

afterEach(() => {
	vimApi.mapclear();
	Notice.messages.length = 0;
});

interface Command {
	id: string;
	name: string;
	callback?: () => void;
	editorCheckCallback?: (checking: boolean) => boolean;
}

async function start(doc = "alpha bravo\ncharlie") {
	const editor = makeEditor(doc);
	const app = new App();
	app.vimEnabled = true;

	// How Obsidian exposes an editor: `editor.cm` is the CodeMirror 6 view and
	// `editor.cm.cm` the CodeMirror 5 shim that the Vim API takes.
	const view = Object.assign(editor.view, { cm: editor.cm });
	const markdown = new MarkdownView();
	markdown.editor = { cm: view };
	app.workspace.activeView = markdown;

	const plugin = new EditorImprovementsPlugin(app as never, {} as never);
	await plugin.onload();
	app.workspace.flushLayoutReady();

	// The test double for Plugin records commands on `commands`.
	const commands = () => (plugin as unknown as { commands: Command[] }).commands;
	const run = (id: string) => {
		const command = commands().find((c) => c.id === id);
		if (!command) {
			throw new Error(`no command ${id}`);
		}
		if (command.editorCheckCallback) {
			expect(command.editorCheckCallback(true)).toBe(true);
			command.editorCheckCallback(false);
		} else {
			command.callback?.();
		}
	};
	return { ...editor, app, plugin, commands, run, text: () => editor.view.state.doc.toString() };
}

describe("EditorImprovementsPlugin", () => {
	it("registers a command for every action and for its own utilities", async () => {
		const t = await start();
		const ids = t.commands().map((c) => c.id);

		for (const id of ["reload-config", "show-status", "create-scripts-folder"]) {
			expect(ids).toContain(id);
		}
		for (const id of ["selectAll", "copyPath", "pasteAsPlainText", "insertLineBelow", "goToNextWord", "undo"]) {
			expect(ids).toContain(id);
		}
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("loads every module", async () => {
		const t = await start();

		expect(t.plugin.modulesHost.active).toEqual(MODULES.map((m) => m.id));
	});

	it("runs a command from the palette on the active editor", async () => {
		const t = await start("a\nb");

		t.run("insertLineBelow");

		expect(t.text()).toBe("a\n\nb");
	});

	it("moves with a motion command, clamped to normal mode", async () => {
		const t = await start("alpha bravo");

		t.run("goToLineEnd");

		expect(t.view.state.selection.main.head).toBe(10);
	});

	it("is unavailable as a command when no editor is open", async () => {
		const t = await start();
		t.app.workspace.activeView = null;
		const command = t.commands().find((c) => c.id === "insertLineBelow");

		expect(command?.editorCheckCallback?.(true)).toBe(false);
	});

	it("applies a script's mapping once scripts are enabled", async () => {
		const t = await start("hello");
		t.plugin.settings.scriptsEnabled = true;
		const { adapter } = t.app.vault;
		await adapter.mkdir(".obsidian/editor-improvements");
		await adapter.write(".obsidian/editor-improvements/init.js", `vim.nnoremap("gz", "x");`);

		await t.plugin.reloadScripts();
		press(t.cm, "g", "z");

		expect(t.text()).toBe("ello");
	});

	it("takes its keys back when unloaded", async () => {
		const t = await start("hello");
		t.plugin.settings.scriptsEnabled = true;
		const { adapter } = t.app.vault;
		await adapter.mkdir(".obsidian/editor-improvements");
		await adapter.write(".obsidian/editor-improvements/init.js", `vim.nnoremap("gz", "x");`);
		await t.plugin.reloadScripts();

		t.plugin.unload();
		press(t.cm, "g", "z");

		expect(t.text()).toBe("hello");
	});

	describe("settings that change what scripts do", () => {
		async function withScript(code: string) {
			const t = await start("hello");
			await t.app.vault.adapter.mkdir(".obsidian/editor-improvements");
			await t.app.vault.adapter.write(".obsidian/editor-improvements/init.js", code);
			return t;
		}

		it("turning scripts on applies them, and off takes them away again", async () => {
			const t = await withScript(`vim.nnoremap("gz", "x");`);
			press(t.cm, "g", "z");
			expect(t.text()).toBe("hello");

			t.plugin.settings.scriptsEnabled = true;
			await t.plugin.reloadScripts();
			press(t.cm, "g", "z");
			expect(t.text()).toBe("ello");

			t.plugin.settings.scriptsEnabled = false;
			await t.plugin.reloadScripts();
			press(t.cm, "g", "z");
			expect(t.text()).toBe("ello");
		});

		it("a changed leader key reaches the mappings that use it", async () => {
			const t = await withScript(`vim.nnoremap("<leader>z", "x");`);
			t.plugin.settings.scriptsEnabled = true;
			t.plugin.settings.leader = "§";
			await t.plugin.reloadScripts();

			press(t.cm, "§", "z");
			expect(t.text()).toBe("ello");

			t.plugin.settings.leader = "¤";
			await t.plugin.reloadScripts();
			// The old leader is no longer a key of ours; the stray z that follows it
			// starts one of vim's own z commands, so cancel it.
			press(t.cm, "§", "z", "<Esc>");
			expect(t.text()).toBe("ello");
			press(t.cm, "¤", "z");
			expect(t.text()).toBe("llo");
		});

		it("a script's own leader beats the setting, for that script only", async () => {
			const t = await withScript(`vim.leader("§"); vim.nnoremap("<leader>z", "x");`);
			t.plugin.settings.scriptsEnabled = true;
			t.plugin.settings.leader = "¤";

			await t.plugin.reloadScripts();
			press(t.cm, "§", "z");

			expect(t.text()).toBe("ello");
		});

		it("reports a broken script by file and line without disturbing the others", async () => {
			const t = await withScript(`vim.nnoremap("gz", "x");`);
			await t.app.vault.adapter.write(".obsidian/editor-improvements/zz-broken.js", `\n\nthrow new Error("nope");`);
			t.plugin.settings.scriptsEnabled = true;

			await t.plugin.reloadScripts();
			press(t.cm, "g", "z");

			expect(t.text()).toBe("ello");
			expect(Notice.messages.some((m) => m.includes("zz-broken.js:3") && m.includes("nope"))).toBe(true);
		});
	});

	describe("when vim mode is switched off", () => {
		async function withMapping() {
			const t = await start("hello");
			t.plugin.settings.scriptsEnabled = true;
			await t.app.vault.adapter.mkdir(".obsidian/editor-improvements");
			await t.app.vault.adapter.write(".obsidian/editor-improvements/init.js", `vim.nnoremap("gz", "x");`);
			await t.plugin.reloadScripts();
			return t;
		}

		it("hands its keys back straight away, with nothing left in the keymap", async () => {
			const t = await withMapping();

			t.app.vimEnabled = false;
			t.plugin.bridge.refresh();
			press(t.cm, "g", "z");

			expect(t.text()).toBe("hello");
		});

		it("takes them up again when vim mode comes back", async () => {
			const t = await withMapping();
			t.app.vimEnabled = false;
			t.plugin.bridge.refresh();

			t.app.vimEnabled = true;
			t.plugin.bridge.refresh();
			press(t.cm, "g", "z");

			expect(t.text()).toBe("ello");
		});

		it("leaves nothing behind if the plugin is then turned off", async () => {
			const t = await withMapping();
			t.app.vimEnabled = false;
			t.plugin.bridge.refresh();

			t.plugin.unload();
			t.app.vimEnabled = true;
			press(t.cm, "g", "z");

			expect(t.text()).toBe("hello");
		});
	});

	it("reports status", async () => {
		const t = await start();

		t.run("show-status");

		expect(Notice.messages.at(-1)).toMatch(/normal mode/);
		expect(Notice.messages.at(-1)).toMatch(/scripts disabled/);
	});

	it("says so when vim mode is off", async () => {
		const t = await start();
		t.app.vimEnabled = false;

		t.run("show-status");

		expect(Notice.messages.at(-1)).toMatch(/vim mode is off/);
	});

	it("persists a changed setting and reads it back", async () => {
		const t = await start();
		t.plugin.settings.autoInsertListPrefix = false;

		await t.plugin.saveSettings();
		await t.plugin.onExternalSettingsChange();

		expect(t.plugin.settings.autoInsertListPrefix).toBe(false);
	});

	it("honours the list-continuation setting live, without a reload", async () => {
		const t = await start("- a");
		t.plugin.settings.autoInsertListPrefix = false;

		t.run("insertLineBelow");

		expect(t.text()).toBe("- a\n");
	});
});
