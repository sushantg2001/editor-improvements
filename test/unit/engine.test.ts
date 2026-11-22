import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ForkEngine } from "../../src/engine/fork";
import { parseKeys } from "../../src/notation/parse";

function editor(engine: ForkEngine, doc = "one\ntwo\nthree"): EditorView {
	const parent = document.createElement("div");
	document.body.append(parent);
	return new EditorView({ state: EditorState.create({ doc, extensions: [engine.extension()] }), parent });
}

const type = (engine: ForkEngine, view: EditorView, keys: string) => {
	for (const key of parseKeys(keys)) engine.deliverKey(view, key);
};

describe("engine adapter", () => {
	test("ENGINE-A5: delivered keys edit like typed keys, with dot-repeat", () => {
		const engine = new ForkEngine();
		const view = editor(engine);
		expect(engine.isAttached(view)).toBe(true);
		type(engine, view, "dd");
		expect(view.state.doc.toString()).toBe("two\nthree");
		type(engine, view, ".");
		expect(view.state.doc.toString()).toBe("three");
		view.destroy();
	});

	test("ENGINE-A8: mode reports normal, insert and visual", () => {
		const engine = new ForkEngine();
		const view = editor(engine);
		expect(engine.mode(view)).toBe("n");
		type(engine, view, "i");
		expect(engine.mode(view)).toBe("i");
		type(engine, view, "<Esc>V");
		expect(engine.mode(view)).toBe("x");
		type(engine, view, "<Esc>v");
		expect(engine.mode(view)).toBe("v");
		type(engine, view, "<Esc>");
		view.destroy();
	});

	test("ENGINE-A4: a new generation replaces the old one, and clear removes it", () => {
		const engine = new ForkEngine();
		const view = editor(engine);
		const map = (lhs: string, rhs: string) => ({ mode: "n" as const, lhs: parseKeys(lhs), rhs: parseKeys(rhs), noremap: true });
		expect(engine.apply({ maps: [map("Q", "dd")], options: [], commands: [] })).toEqual([]);
		type(engine, view, "Q");
		expect(view.state.doc.toString()).toBe("two\nthree");
		engine.apply({ maps: [map("W", "dd")], options: [], commands: [] });
		type(engine, view, "Q");
		expect(view.state.doc.toString()).toBe("two\nthree");
		type(engine, view, "W");
		expect(view.state.doc.toString()).toBe("three");
		engine.clear();
		type(engine, view, "W");
		expect(view.state.doc.toString()).toBe("three");
		view.destroy();
	});

	test("ENGINE-A3: options are restored when cleared", () => {
		const engine = new ForkEngine();
		const before = engine.getOption("ignorecase");
		expect(engine.apply({ maps: [], options: [["ignorecase", !before]], commands: [] })).toEqual([]);
		expect(engine.getOption("ignorecase")).toBe(!before);
		engine.clear();
		expect(engine.getOption("ignorecase")).toBe(before);
		expect(engine.isOption("nope")).toBe(false);
		for (const name of ["ignorecase", "smartcase", "hlsearch"]) expect(engine.isOption(name)).toBe(true);
	});

	test("feedKeys does not apply user mappings", () => {
		const engine = new ForkEngine();
		const view = editor(engine);
		engine.apply({ maps: [{ mode: "n", lhs: ["x"], rhs: parseKeys("dd"), noremap: true }], options: [], commands: [] });
		engine.feedKeys(view, ["x"]);
		expect(view.state.doc.toString()).toBe("ne\ntwo\nthree");
		engine.clear();
		view.destroy();
	});
});
