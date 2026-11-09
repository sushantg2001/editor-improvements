import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { getVimMode } from "../../../src/core/editor";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { createScriptApi } from "../../../src/scripts/api";
import { App } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";
import type { VimContext } from "../../../src/types";

/**
 * Operators defined by a script, against the real addon: what range they are
 * handed and whether vim treats them as it does its own.
 */

afterEach(() => {
	vimApi.mapclear();
});

type ScriptFactory = new (...args: string[]) => (vim: unknown) => Promise<void>;
const AsyncFunction = (
	Object.getPrototypeOf(async function () {}) as { constructor: ScriptFactory }
).constructor;

async function setup(doc: string, script: string) {
	const editor = makeEditor(doc);
	const app = new App();
	const registry = new ActionRegistry();
	const { api, contribution } = createScriptApi({
		app: app as never,
		getVim: () => vimApi,
		leader: "\\",
		knowsAction: (id) => registry.has(id),
	});
	await new AsyncFunction("vim", script)(api);
	registry.set("script:init.js", contribution);
	const dispatcher = new VimDispatcher(
		app as never,
		registry,
		(cm) =>
			({ ...editor.ctx, app, editor: {} as never, cm, mode: getVimMode(cm) }) as unknown as VimContext,
		() => vimApi,
	);
	new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings);
	return { ...editor, text: () => editor.view.state.doc.toString() };
}

/** An operator that upper-cases whatever range it is given. */
const SHOUT = `
	vim.operator("shout", (ctx, args) => {
		const { doc } = ctx.view.state;
		const at = (p) => doc.line(p.line + 1).from + p.ch;
		const from = at(args.range.from);
		const to = at(args.range.to);
		ctx.view.dispatch({ changes: { from, to, insert: doc.sliceString(from, to).toUpperCase() } });
	});
	vim.nmap("gu", "shout");
	vim.vmap("gu", "shout");
`;

describe("a script operator", () => {
	it("works on the text a motion covers", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "g", "u", "w");

		expect(t.text()).toBe("ONE two three");
	});

	it("takes a count on the motion", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "g", "u", "2", "w");

		expect(t.text()).toBe("ONE TWO three");
	});

	it("works on a visual selection", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "w", "v", "e", "g", "u");

		expect(t.text()).toBe("one TWO three");
	});

	it("works on a text object", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "w", "g", "u", "i", "w");

		expect(t.text()).toBe("one TWO three");
	});

	it("repeats with the dot command like a built-in operator", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "g", "u", "w", "w", ".");

		expect(t.text()).toBe("ONE TWO three");
	});

	it("is handed the range in document order, whichever way the motion went", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "w", "w", "g", "u", "b");

		expect(t.text()).toBe("one TWO three");
	});

	it("includes the last character for an inclusive motion", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "g", "u", "e");

		expect(t.text()).toBe("ONE two three");
	});

	it("leaves a cursor at the start of the range, as vim's own operators do", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "w", "g", "u", "w");

		const range = t.view.state.selection.main;
		expect(range.empty).toBe(true);
		expect(range.head).toBe(4);
	});

	it("leaves no selection behind after a visual operator, and returns to normal mode", async () => {
		const t = await setup("one two three", SHOUT);

		press(t.cm, "w", "v", "e", "g", "u");

		const range = t.view.state.selection.main;
		expect(range.empty).toBe(true);
		expect(range.head).toBe(4);
		expect(t.cm.state.vim?.visualMode).toBe(false);
	});

	it("lets the operator choose where the cursor ends up by returning a position", async () => {
		const t = await setup(
			"one two three",
			`vim.operator("jump", () => ({ line: 0, ch: 8 })); vim.nmap("gj", "jump");`,
		);

		press(t.cm, "g", "j", "w");

		expect(t.view.state.selection.main.head).toBe(8);
	});

	it("does nothing, rather than throw, when run with no motion to give it a range", async () => {
		const t = await setup("one two", SHOUT);

		expect(() => press(t.cm, "g", "u", "<Esc>")).not.toThrow();
		expect(t.text()).toBe("one two");
	});
});
