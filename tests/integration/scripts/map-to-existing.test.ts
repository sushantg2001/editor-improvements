import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";
import type { VimActionDef } from "../../../src/types";

/**
 * A script mapping a key to something defined elsewhere: by a built-in module,
 * or by an earlier script. The key must get what that thing is, a motion that
 * moves and composes with `d` or an operator that takes a range, not a plain
 * action that runs and moves nothing.
 */

const FOLDER = ".obsidian/vim-tools";

afterEach(() => {
	vimApi.mapclear();
});

/** A motion a built-in module might contribute: to the start of the next word. */
const nextWord: VimActionDef = {
	id: "nextWord",
	name: "Next word",
	group: "Cursor",
	kind: "motion",
	run: (ctx) => {
		const { doc, selection } = ctx.view.state;
		const text = doc.toString();
		const from = selection.main.head;
		const next = /\s\S/.exec(text.slice(from));
		const to = next ? from + next.index + 1 : text.length;
		const line = doc.lineAt(to);
		return { line: line.number - 1, ch: to - line.from };
	},
};

async function setup(doc: string, files: Record<string, string>, extra: VimActionDef[] = [nextWord]) {
	const editor = makeEditor(doc);
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	const registry = new ActionRegistry();
	registry.set("module:test", { actions: extra });
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => vimApi,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const result = await host.reload();
	expect(result.errors).toEqual([]);
	const dispatcher = new VimDispatcher(app as never, registry, () => editor.ctx, () => vimApi);
	const { bindings } = resolveBindings(registry);
	new MappingLedger().apply(vimApi, dispatcher, bindings);
	return { ...editor, registry, bindings, text: () => editor.view.state.doc.toString(), cursor: () => editor.view.state.selection.main.head };
}

describe("a script mapping a key to a motion defined elsewhere", () => {
	it("binds it as a motion", async () => {
		const t = await setup("one two", { "init.js": `vim.nmap("gm", "nextWord");` });

		expect(t.bindings.find((b) => b.keys === "gm" && b.context === "normal")?.target).toMatchObject({
			kind: "action",
			id: "nextWord",
			actionKind: "motion",
		});
	});

	it("moves the cursor", async () => {
		const t = await setup("one two three", { "init.js": `vim.nmap("gm", "nextWord");` });

		press(t.cm, "g", "m");

		expect(t.cursor()).toBe(4);
	});

	it("composes with an operator", async () => {
		const t = await setup("one two three", { "init.js": `vim.nmap("gm", "nextWord");` });

		press(t.cm, "d", "g", "m");

		expect(t.text()).toBe("two three");
	});

	it("extends a visual selection when mapped for visual mode", async () => {
		const t = await setup("one two three", { "init.js": `vim.vmap("gm", "nextWord");` });

		press(t.cm, "v", "g", "m", "d");

		expect(t.text()).toBe("wo three");
	});

	it("works the same through bind()", async () => {
		const t = await setup("one two three", { "init.js": `vim.bind("gm", "nextWord");` });

		press(t.cm, "d", "g", "m");

		expect(t.text()).toBe("two three");
	});
});

describe("a script mapping a key to something an earlier script defined", () => {
	it("gets a motion's kind from the earlier script", async () => {
		const t = await setup(
			"one two three",
			{
				"init.js": `vim.motion("toEnd", (ctx) => ({ line: 0, ch: 7 }));`,
				"keys.js": `vim.nmap("gz", "toEnd");`,
			},
			[],
		);

		press(t.cm, "d", "g", "z");

		expect(t.text()).toBe(" three");
	});

	it("gets an operator's kind from the earlier script", async () => {
		const t = await setup(
			"one two three",
			{
				"init.js": `vim.operator("shout", (ctx, args) => { const doc = ctx.view.state.doc; const at = (p) => doc.line(p.line + 1).from + p.ch; ctx.view.dispatch({ changes: { from: at(args.range.from), to: at(args.range.to), insert: doc.sliceString(at(args.range.from), at(args.range.to)).toUpperCase() } }); });`,
				"keys.js": `vim.nmap("gu", "shout");`,
			},
			[],
		);

		press(t.cm, "g", "u", "w");

		expect(t.text()).toBe("ONE two three");
	});

	it("still treats a plain action as an action", async () => {
		const t = await setup(
			"one two",
			{
				"init.js": `vim.action("cut", (ctx) => ctx.view.dispatch({ changes: { from: 0, to: 1 } }));`,
				"keys.js": `vim.nmap("gx", "cut");`,
			},
			[],
		);

		press(t.cm, "g", "x");

		expect(t.text()).toBe("ne two");
	});
});
