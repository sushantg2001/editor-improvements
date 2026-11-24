import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { App } from "obsidian";
import { ActionRegistry, type RunContext } from "../../src/actions/registry";
import type { EngineMap, MapMode } from "../../src/engine/engine";
import { ForkEngine } from "../../src/engine/fork";
import { parseKeys, parseRhs } from "../../src/notation/parse";

const map = (mode: MapMode, lhs: string, rhs: string): EngineMap => ({ mode, lhs: parseKeys(lhs), rhs: parseRhs(rhs), noremap: true });

/** A real editor with the real engine, its mappings, and `keys:` actions run through the real registry. */
function setup(doc: string, maps: EngineMap[] = []) {
	const engine = new ForkEngine();
	const parent = document.createElement("div");
	document.body.append(parent);
	const view = new EditorView({ state: EditorState.create({ doc, extensions: [engine.extension()] }), parent });
	expect(engine.apply({ maps, options: [], commands: [] })).toEqual([]);
	const errors: string[] = [];
	const actions = new ActionRegistry({} as App, engine, (_, message) => errors.push(message));
	const context: RunContext = { classified: { context: "editor", editorView: view, win: window }, event: null };
	return {
		engine,
		view,
		errors,
		text: () => view.state.doc.toString(),
		mode: () => engine.mode(view),
		type: (keys: string) => {
			for (const key of parseKeys(keys)) engine.deliverKey(view, key);
		},
		keys: (text: string) => actions.run(`keys:${text}`, context),
		done: () => {
			engine.clear();
			view.destroy();
		},
	};
}

describe("right-hand sides in the real engine", () => {
	test("NOTATION-A10: <Nop> and <Ignore> make a key do nothing", () => {
		const t = setup("  one", [map("n", "z", "<Nop>"), map("n", "Z", "<Ignore>"), map("i", "<C-u>", "<Nop>")]);
		t.type("zZ");
		expect([t.text(), t.mode()]).toEqual(["  one", "n"]);
		t.type("<lt><lt>");
		expect(t.text()).toBe("one");
		t.type("i<C-u>a<Esc>");
		expect([t.text(), t.mode()]).toEqual(["aone", "n"]);
		expect(t.keys("<Nop>")).toBe("handled");
		expect(t.text()).toBe("aone");
		t.done();
	});

	test("NOTATION-A11: <Cmd> runs an ex command without changing mode", () => {
		const t = setup("one two", [
			map("n", "Q", "<Cmd>s/one/ONE/<CR>"),
			map("i", "<C-s>", "<Cmd>s/two/TWO/<CR>"),
			map("i", "<C-q>", "<Cmd>s/ONE/1/<CR><Esc>"),
		]);
		t.type("Q");
		expect([t.text(), t.mode()]).toEqual(["ONE two", "n"]);
		t.type("A<C-s>");
		expect([t.text(), t.mode()]).toEqual(["ONE TWO", "i"]);
		t.type("<C-q>");
		expect([t.text(), t.mode()]).toEqual(["1 TWO", "n"]);
		expect(t.keys("<Cmd>s/TWO/two/<CR>A!<Esc>")).toBe("handled");
		expect([t.text(), t.mode()]).toEqual(["1 two!", "n"]);
		expect(t.errors).toEqual([]);
		t.done();
	});

	test("NOTATION-A12: keys: surrounds a word with < and >", () => {
		const t = setup("foo bar");
		expect(t.keys("ciw<lt>><Esc>P")).toBe("handled");
		expect([t.text(), t.mode()]).toEqual(["<foo> bar", "n"]);
		t.done();
	});

	test("NOTATION-A12: <lt> is the < key wherever it is fed", () => {
		const t = setup("foo bar", [map("n", "Q", "r<lt>"), map("i", "<C-l>", "<lt>pa>")]);
		t.keys("r<lt>Wr>");
		expect(t.text()).toBe("<oo >ar");
		t.type("0lQ");
		expect(t.text()).toBe("<<o >ar");
		t.type("0i<C-l><Esc>");
		expect([t.text(), t.mode()]).toEqual(["<pa><<o >ar", "n"]);
		t.keys(":s/<lt><lt>/[/<CR>");
		expect(t.text()).toBe("<pa>[o >ar");
		t.keys("I  <Esc><lt><lt>");
		expect(t.text()).toBe("<pa>[o >ar");
		t.done();
	});

	test("a noremap right-hand side reaches a <Plug> mapping", () => {
		const t = setup("one\ntwo", [{ ...map("n", "<Plug>(delete-line)", "dd"), noremap: false }, map("n", "Q", "<Plug>(delete-line)")]);
		t.type("Q");
		expect(t.text()).toBe("two");
		t.done();
	});
});
