import { afterEach, describe, expect, it } from "vitest";

import EditorImprovementsPlugin from "../../src/main";
import { App, MarkdownView } from "../mocks/obsidian";
import { makeEditor, press, vimApi } from "../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

interface Command {
	id: string;
	name: string;
	callback?: () => void;
	editorCheckCallback?: (checking: boolean) => boolean;
}

async function start() {
	const editor = makeEditor("hello");
	const app = new App();
	app.vimEnabled = true;
	const view = Object.assign(editor.view, { cm: editor.cm });
	const markdown = new MarkdownView();
	markdown.editor = { cm: view };
	app.workspace.activeView = markdown;
	const plugin = new EditorImprovementsPlugin(app as never, {} as never);
	await plugin.onload();
	app.workspace.flushLayoutReady();
	plugin.settings.scriptsEnabled = true;
	await app.vault.adapter.mkdir(".obsidian/editor-improvements");

	const commands = () => (plugin as unknown as { commands: Command[] }).commands;
	const find = (id: string) => commands().find((c) => c.id === id);
	const script = async (code: string) => {
		await app.vault.adapter.write(".obsidian/editor-improvements/init.js", code);
		await plugin.reloadScripts();
	};
	return { ...editor, app, plugin, commands, find, script };
}

describe("the command palette follows the scripts", () => {
	it("adds a command for a new action", async () => {
		const t = await start();

		await t.script(`vim.action("greet", () => {}, { name: "Say hello" });`);

		expect(t.find("greet")?.name).toBe("Say hello");
	});

	it("removes the command when the action is deleted from the script", async () => {
		const t = await start();
		await t.script(`vim.action("greet", () => {});`);

		await t.script(``);

		expect(t.find("greet")).toBeUndefined();
	});

	it("shows a renamed action under its new name", async () => {
		const t = await start();
		await t.script(`vim.action("greet", () => {}, { name: "Say hello" });`);

		await t.script(`vim.action("greet", () => {}, { name: "Say hi" });`);

		expect(t.find("greet")?.name).toBe("Say hi");
	});

	it("follows an action that stops needing an editor", async () => {
		const t = await start();
		await t.script(`vim.action("greet", () => {});`);
		expect(t.find("greet")?.editorCheckCallback).toBeTypeOf("function");

		await t.script(`vim.action("greet", () => {}, { needsEditor: false });`);

		expect(t.find("greet")?.callback).toBeTypeOf("function");
		expect(t.find("greet")?.editorCheckCallback).toBeUndefined();
	});

	it("drops the command when the action is kept out of the palette", async () => {
		const t = await start();
		await t.script(`vim.action("greet", () => {});`);

		await t.script(`vim.action("greet", () => {}, { command: false });`);

		expect(t.find("greet")).toBeUndefined();
	});

	it("runs the newest body from the same command, without re-registering it", async () => {
		const t = await start();
		await t.script(`vim.action("cut", (ctx) => ctx.view.dispatch({ changes: { from: 0, to: 1 } }));`);
		const before = t.find("cut");

		await t.script(`vim.action("cut", (ctx) => ctx.view.dispatch({ changes: { from: 0, to: 2 } }));`);
		before?.editorCheckCallback?.(false);

		expect(t.view.state.doc.toString()).toBe("llo");
		expect(t.commands().filter((c) => c.id === "cut")).toHaveLength(1);
	});

	it("keeps the plugin's own commands through every reload", async () => {
		const t = await start();

		await t.script(`vim.action("greet", () => {});`);
		await t.script(``);

		for (const id of ["reload-config", "show-status", "create-scripts-folder", "selectAll"]) {
			expect(t.find(id), id).toBeDefined();
		}
	});

	it("does not leave a mapping behind for a removed action", async () => {
		const t = await start();
		await t.script(`vim.action("cut", (ctx) => ctx.view.dispatch({ changes: { from: 0, to: 1 } })); vim.nmap("gz", "cut");`);
		press(t.cm, "g", "z");
		expect(t.view.state.doc.toString()).toBe("ello");

		await t.script(``);
		press(t.cm, "g", "z");

		expect(t.view.state.doc.toString()).toBe("ello");
	});
});
