import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";

const select = (doc: string, from: number, to: number) => {
	const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
	const next = state.update(edits.selectNextOccurrence(state)!).state.selection.main;
	return [next.from, next.to];
};

describe("selecting the next occurrence of a selection", () => {
	it("matches whole words only when the selection is a whole word", () => {
		// "foo" at 0 stands alone, so the "foo" inside "xfoo" is not the next one.
		expect(select("foo xfoo foo", 0, 3)).toEqual([9, 12]);
	});

	it("matches inside words when the selection sits inside one", () => {
		// The selected "foo" has a letter before it, so any "foo" counts, including the one in "yfoo".
		expect(select("xfoo yfoo", 1, 4)).toEqual([6, 9]);
	});

	it("matches inside words when a letter follows the selection", () => {
		// "foo" in "foob" is not a whole word, so the next "foo" may be anywhere.
		expect(select("a foob foo", 2, 5)).toEqual([7, 10]);
	});

	it("treats a selection at the very start of the document as having nothing before it", () => {
		expect(select("foo foo", 0, 3)).toEqual([4, 7]);
	});
});
