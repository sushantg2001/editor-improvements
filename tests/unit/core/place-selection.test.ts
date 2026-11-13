import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { placeSelection } from "../../../src/core/vim-editing";
import type { CodeMirrorShim } from "../../../src/types";

function setup(doc: string) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const view = new EditorView({ state: EditorState.create({ doc }), parent });
	const insideVimKey = { curOp: { isVimOp: true } } as unknown as CodeMirrorShim;
	const outsideVimKey = {} as unknown as CodeMirrorShim;
	return { view, insideVimKey, outsideVimKey };
}

const tick = () => Promise.resolve();

describe("placeSelection", () => {
	it("applies at once outside a vim key", () => {
		const t = setup("hello world");

		placeSelection(t.view, t.outsideVimKey, EditorSelection.single(0, 5));

		expect(t.view.state.selection.main.to).toBe(5);
	});

	it("waits for the end of a vim key, then applies", async () => {
		const t = setup("hello world");

		placeSelection(t.view, t.insideVimKey, EditorSelection.single(0, 5));
		expect(t.view.state.selection.main.empty).toBe(true);
		await tick();

		expect(t.view.state.selection.main.to).toBe(5);
	});

	it("drops a deferred selection when the text changed in between, as in a macro", async () => {
		// Commands run one after another in a macro or a mapping; the ones after
		// this may shorten the document, and the selection is for text that is gone.
		const t = setup("hello world, long enough");

		placeSelection(t.view, t.insideVimKey, EditorSelection.single(15, 22));
		t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: "short" } });
		await tick();

		expect(t.view.state.selection.main.empty).toBe(true);
		expect(t.view.state.doc.toString()).toBe("short");
	});

	it("still applies when only the selection moved in between", async () => {
		const t = setup("hello world");

		placeSelection(t.view, t.insideVimKey, EditorSelection.single(6, 11));
		t.view.dispatch({ selection: { anchor: 2 } });
		await tick();

		expect(t.view.state.selection.main.from).toBe(6);
	});

	it("does not throw for an editor that was closed in the meantime", async () => {
		const t = setup("hello world");

		placeSelection(t.view, t.insideVimKey, EditorSelection.single(0, 5));
		t.view.destroy();

		await expect(tick()).resolves.toBeUndefined();
	});
});
