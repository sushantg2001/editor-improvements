import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";

/** What a script's motion hands back goes straight into vim and CodeMirror. */

const FOLDER = ".obsidian/editor-improvements";
const DOC = "one two\nthree four\nfive six";

beforeEach(() => {
	Notice.messages.length = 0;
});

afterEach(() => {
	vimApi.mapclear();
});

async function motion(returns: string) {
	const editor = makeEditor(DOC);
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
	return {
		cursor: () => editor.view.state.selection.main.head,
		text: () => editor.view.state.doc.toString(),
		press: (...keys: string[]) => press(editor.cm, ...keys),
	};
}

describe("a motion that returns a good position", () => {
	it("moves there, and composes with d", async () => {
		const t = await motion("{ line: 1, ch: 2 }");

		t.press("g", "q");
		expect(t.cursor()).toBe(10);

		t.press("0", "d", "g", "q");
		expect(t.text()).toBe("one two\nree four\nfive six");
		expect(Notice.messages).toEqual([]);
	});

	it("is rounded down when it has a fraction, never leaving the cursor between characters", async () => {
		const t = await motion("{ line: 1.5, ch: 2.5 }");

		t.press("g", "q");

		expect(t.cursor()).toBe(10);
		expect(Number.isInteger(t.cursor())).toBe(true);
	});
});

describe("a motion that returns something that is not a position", () => {
	it.each([
		["a NaN column", "{ line: 0, ch: NaN }"],
		["a NaN line", "{ line: NaN, ch: 1 }"],
		["no column", "{ line: 1 }"],
		["an undefined column", "{ line: 1, ch: undefined }"],
		["text for numbers", '{ line: "1", ch: "2" }'],
		["Infinity", "{ line: Infinity, ch: 0 }"],
	])("leaves the cursor and says so, for %s", async (_name, returns) => {
		const t = await motion(returns);
		t.press("l");
		const before = t.cursor();

		expect(() => t.press("g", "q")).not.toThrow();
		expect(t.cursor()).toBe(before);
		expect(Notice.messages.join("\n")).toMatch(/"m" failed[\s\S]*finite numbers/);

		expect(() => t.press("d", "g", "q")).not.toThrow();
		expect(t.text()).toBe(DOC);
	});

	it("is not reported when the motion returns nothing, which just stays put", async () => {
		const t = await motion("undefined");

		t.press("g", "q");

		expect(t.cursor()).toBe(0);
		expect(Notice.messages).toEqual([]);
	});
});
