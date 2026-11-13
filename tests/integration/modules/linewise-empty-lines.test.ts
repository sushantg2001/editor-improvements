import { EditorSelection, EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import * as edits from "../../../src/modules/editor-shortcuts/edits";
import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

/**
 * In linewise visual mode the line the selection ends on is always one of the
 * lines, an empty one included. The selection of an empty line ends at that
 * line's start, which is also how "whole lines plus their newline" ends.
 */

const DOCS = [
	"gamma\n\nbar alpha foo",
	"\nd\n\nBeta",
	"one\ntwo\n\n\nfour",
	"a\n\nb\n\nc",
	"\n\n\n",
];

function selected(doc: string, from: number, to: number, command: string) {
	const t = moduleHarness(editorShortcutsModule, doc);
	t.bind("gx", command, ["normal", "visual"]);
	press(t.cm, ...String(from).split(""), "G", "V", ...String(to).split(""), "G", "g", "x");
	return t.text();
}

describe("a linewise selection that ends on an empty line", () => {
	for (const doc of DOCS) {
		const lines = doc.split("\n");
		for (let from = 1; from <= lines.length; from++) {
			for (let to = 1; to <= lines.length; to++) {
				const lo = Math.min(from, to) - 1;
				const hi = Math.max(from, to) - 1;

				it(`deletes exactly lines ${lo + 1}-${hi + 1} of ${JSON.stringify(doc)} (from ${from} to ${to})`, () => {
					const expected = [...lines.slice(0, lo), ...lines.slice(hi + 1)].join("\n");

					expect(selected(doc, from, to, "deleteLine")).toBe(expected);
				});

				it(`copies exactly lines ${lo + 1}-${hi + 1} of ${JSON.stringify(doc)} (from ${from} to ${to})`, () => {
					const expected = [...lines.slice(0, hi + 1), ...lines.slice(lo, hi + 1), ...lines.slice(hi + 1)].join("\n");

					expect(selected(doc, from, to, "copyLineDown")).toBe(expected);
				});
			}
		}
	}
});

describe("a selection that is not linewise visual", () => {
	const state = (doc: string, anchor: number, head: number) =>
		EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });

	it("still stops before a line it only reaches the start of", () => {
		// "a\n" selected, as by the select-line command: the second line is not part of it.
		const s = state("a\nb", 0, 2);

		expect(s.update(edits.deleteLine(s)!).state.doc.toString()).toBe("b");
	});

	it("includes that line when told the selection is linewise visual", () => {
		const s = edits.asLinewise(state("a\n\nb", 0, 2));

		expect(s.update(edits.deleteLine(s)!).state.doc.toString()).toBe("b");
	});

	it("keeps the line after an empty one when it is not told", () => {
		const s = state("a\n\nb", 0, 2);

		expect(s.update(edits.deleteLine(s)!).state.doc.toString()).toBe("\nb");
	});
});
