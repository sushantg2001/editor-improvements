import { EditorSelection, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { vimAnchorOffset, vimHeadOffset, visualRange } from "../../../src/core/vim-editing";

const doc = Text.of(["hello world"]);

describe("vim's cursor for a visual range", () => {
	it("is the character before the end of a forward range", () => {
		const range = EditorSelection.range(2, 5);

		expect(vimAnchorOffset(range)).toBe(2);
		expect(vimHeadOffset(range)).toBe(4);
	});

	it("is the character before the end of a backward range", () => {
		const range = EditorSelection.range(5, 2);

		expect(vimAnchorOffset(range)).toBe(4);
		expect(vimHeadOffset(range)).toBe(2);
	});

	it("is the cursor itself when nothing is selected, as on an empty line at the end", () => {
		const range = EditorSelection.cursor(3);

		expect(vimAnchorOffset(range)).toBe(3);
		expect(vimHeadOffset(range)).toBe(3);
	});
});

describe("the range for a visual selection", () => {
	it("covers the character under a single cursor, forward", () => {
		const range = visualRange(doc, 4, 4);

		expect({ anchor: range.anchor, head: range.head }).toEqual({ anchor: 4, head: 5 });
	});

	it("includes the character at the end of a forward selection", () => {
		const range = visualRange(doc, 2, 5);

		expect({ anchor: range.anchor, head: range.head }).toEqual({ anchor: 2, head: 6 });
	});

	it("includes the character at the start of a backward selection", () => {
		const range = visualRange(doc, 5, 2);

		expect({ anchor: range.anchor, head: range.head }).toEqual({ anchor: 6, head: 2 });
	});

	it("stops at the end of the document", () => {
		const range = visualRange(doc, 3, doc.length);

		expect(range.to).toBe(doc.length);
	});
});
