import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";
import { charAtIndex, charBeforeIndex, toTitleCase, wordRangeAt } from "../../../../src/modules/editor-shortcuts/text";

/**
 * Letters outside the basic plane are two UTF-16 units. 𠮷 (CJK) and 𐐨
 * (Deseret, which has upper and lower case) are letters; neither half is.
 */

const stateAt = (doc: string, anchor: number, head = anchor) =>
	EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });

const apply = (state: EditorState, edit: edits.Edit) => {
	const spec = edit(state);
	return spec ? state.update(spec).state : state;
};

describe("reading one character", () => {
	it("takes both halves of a pair", () => {
		expect(charAtIndex("a𠮷b", 1)).toBe("𠮷");
		expect(charBeforeIndex("a𠮷b", 3)).toBe("𠮷");
	});

	it("takes one unit anywhere else", () => {
		expect(charAtIndex("ab", 0)).toBe("a");
		expect(charBeforeIndex("ab", 2)).toBe("b");
		expect(charAtIndex("ab", 2)).toBe("");
		expect(charBeforeIndex("ab", 0)).toBe("");
	});
});

describe("a word of letters outside the basic plane", () => {
	const text = "a 𠮷野家 b";

	it("is found whole from its start, middle and end", () => {
		for (const column of [2, 4, 5, 6]) {
			expect(wordRangeAt(text, column), `column ${column}`).toEqual([2, 6]);
		}
	});

	it("is deleted whole by delete word before", () => {
		const state = stateAt("x 𠮷野家", 6);

		expect(apply(state, edits.deleteWord("before")).doc.toString()).toBe("x ");
	});

	it("is deleted whole by delete word after", () => {
		const state = stateAt("x 𠮷野家 y", 2);

		expect(apply(state, edits.deleteWord("after")).doc.toString()).toBe("x  y");
	});

	it("is selected by select word", () => {
		const state = apply(stateAt("𠮷野家 x", 0), edits.selectNextOccurrence);

		expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe("𠮷野家");
	});
});

describe("changing the case of letters outside the basic plane", () => {
	it("upper-cases a word", () => {
		const state = stateAt("𐐨𐐩 x", 0);

		expect(apply(state, edits.changeCase("upper")).doc.toString()).toBe("𐐀𐐁 x");
	});

	it("title-cases a word without breaking its first letter", () => {
		expect(toTitleCase("𐐨𐐩")).toBe("𐐀𐐩");
		expect(toTitleCase("hello 𐐨𐐩")).toBe("Hello 𐐀𐐩");
	});
});
