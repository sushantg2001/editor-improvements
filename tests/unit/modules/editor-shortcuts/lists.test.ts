import { describe, expect, it } from "vitest";

import {
	isOrderedPrefix,
	listMarkerLength,
	nextListPrefix,
	renumberFrom,
} from "../../../../src/modules/editor-shortcuts/lists";

describe("nextListPrefix", () => {
	it("returns nothing for a line that is not a list item", () => {
		expect(nextListPrefix("plain text", "after")).toBe("");
		expect(nextListPrefix("", "before")).toBe("");
	});

	it.each(["-", "+", "*", ">"])("continues a %s marker", (marker) => {
		expect(nextListPrefix(`${marker} item`, "after")).toBe(`${marker} `);
		expect(nextListPrefix(`${marker} item`, "before")).toBe(`${marker} `);
	});

	it("counts an ordered list up when going after, not before", () => {
		expect(nextListPrefix("3. item", "after")).toBe("4. ");
		expect(nextListPrefix("3. item", "before")).toBe("3. ");
		expect(nextListPrefix("9. item", "after")).toBe("10. ");
	});

	it("starts a new task unticked, whatever the old one was", () => {
		expect(nextListPrefix("- [x] done", "after")).toBe("- [ ] ");
		expect(nextListPrefix("* [ ] todo", "after")).toBe("* [ ] ");
	});

	it("counts up an ordered task too", () => {
		expect(nextListPrefix("2. [x] done", "after")).toBe("3. [ ] ");
	});

	it("signals an empty item with null so the list can end", () => {
		expect(nextListPrefix("- ", "after")).toBeNull();
		expect(nextListPrefix("  1. ", "after")).toBeNull();
		expect(nextListPrefix("- [ ] ", "after")).toBeNull();
	});

	it("does not take a bare marker with no space for a list", () => {
		expect(nextListPrefix("-no", "after")).toBe("");
	});
});

describe("renumberFrom", () => {
	const lines = (...texts: string[]) => {
		let from = 0;
		return texts.map((text) => {
			const line = { from, text };
			from += text.length + 1;
			return line;
		});
	};

	it("adds one to each consecutive item at the same indentation", () => {
		const edits = renumberFrom(lines("2. b", "3. c", "x"), 0, "");

		expect(edits).toEqual([
			{ from: 0, to: 1, insert: "3" },
			{ from: 5, to: 6, insert: "4" },
		]);
	});

	it("stops at the first line that is not an item at that level", () => {
		const edits = renumberFrom(lines("2. b", "  1. nested", "3. c"), 0, "");

		expect(edits).toHaveLength(1);
	});

	it("handles indentation and multi-digit numbers", () => {
		const edits = renumberFrom(lines("  9. a", "  10. b"), 0, "  ");

		expect(edits).toEqual([
			{ from: 2, to: 3, insert: "10" },
			{ from: 9, to: 11, insert: "11" },
		]);
	});
});

describe("listMarkerLength", () => {
	it("measures the marker, indentation and checkbox included", () => {
		expect(listMarkerLength("- item")).toBe(2);
		expect(listMarkerLength("  - [ ] item")).toBe(8);
		expect(listMarkerLength("12. item")).toBe(4);
		expect(listMarkerLength("plain")).toBe(0);
	});
});

describe("isOrderedPrefix", () => {
	it("recognises numbers only", () => {
		expect(isOrderedPrefix("4. ")).toBe(true);
		expect(isOrderedPrefix("- ")).toBe(false);
		expect(isOrderedPrefix("")).toBe(false);
	});
});
