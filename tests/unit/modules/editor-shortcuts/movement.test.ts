import { describe, expect, it } from "vitest";

import * as moves from "../../../../src/modules/editor-shortcuts/movement";
import { stateOf } from "../../../helpers/state";

/** Runs a move from the cursor in `marked` and returns where it lands as `|`. */
function land(move: moves.Move, marked: string, count = 1): string {
	const state = stateOf(marked);
	const to = move(state, state.selection.main.head, count);
	const doc = state.doc.toString();
	return `${doc.slice(0, to)}|${doc.slice(to)}`;
}

describe("line and document moves", () => {
	it("goes to the start and end of the line", () => {
		expect(land(moves.lineStart, "ab\ncd|ef")).toBe("ab\n|cdef");
		expect(land(moves.lineEnd, "ab\nc|def\ngh")).toBe("ab\ncdef|\ngh");
	});

	it("goes to the first and last character of the document", () => {
		expect(land(moves.documentStart, "ab\nc|d")).toBe("|ab\ncd");
		expect(land(moves.documentEnd, "a|b\ncd")).toBe("ab\ncd|");
	});
});

describe("vertical moves", () => {
	it("keeps the column", () => {
		expect(land(moves.lineBelow, "ab|c\ndef")).toBe("abc\nde|f");
		expect(land(moves.lineAbove, "abc\nde|f")).toBe("ab|c\ndef");
	});

	it("falls back to the end of a shorter line", () => {
		expect(land(moves.lineBelow, "abcd|\nx")).toBe("abcd\nx|");
	});

	it("repeats with a count and stops at the edges", () => {
		expect(land(moves.lineBelow, "|a\nb\nc\nd", 2)).toBe("a\nb\n|c\nd");
		expect(land(moves.lineBelow, "|a\nb", 9)).toBe("a\n|b");
		expect(land(moves.lineAbove, "a\n|b", 9)).toBe("|a\nb");
	});
});

describe("character moves", () => {
	it("steps over characters and across line breaks", () => {
		expect(land(moves.charForward, "a|b\ncd")).toBe("ab|\ncd");
		expect(land(moves.charForward, "ab|\ncd")).toBe("ab\n|cd");
		expect(land(moves.charBackward, "ab\n|cd")).toBe("ab|\ncd");
	});

	it("moves a whole grapheme, not half of one", () => {
		expect(land(moves.charForward, "|👍x")).toBe("👍|x");
		expect(land(moves.charBackward, "👍|x")).toBe("|👍x");
	});

	it("stops at the ends and honours a count", () => {
		expect(land(moves.charBackward, "|ab")).toBe("|ab");
		expect(land(moves.charForward, "ab|")).toBe("ab|");
		expect(land(moves.charForward, "|abcd", 3)).toBe("abc|d");
	});
});

describe("word moves", () => {
	it("repeats with a count", () => {
		expect(land(moves.wordForward, "|one two three", 2)).toBe("one two| three");
		expect(land(moves.wordBackward, "one two three|", 2)).toBe("one |two three");
	});
});

describe("headingMove", () => {
	const doc = "# a\ntext\n## b\nmore\n### c\nend";
	const lines = () => [0, 2, 4];

	it("goes to the end of the next heading line", () => {
		expect(land(moves.headingMove(lines, "next"), `#| a\ntext\n## b\nmore\n### c\nend`)).toBe(
			"# a\ntext\n## b|\nmore\n### c\nend",
		);
	});

	it("goes to the previous heading", () => {
		expect(land(moves.headingMove(lines, "previous"), "# a\ntext\n## b\nmore\n### c\ne|nd")).toBe(
			"# a\ntext\n## b\nmore\n### c|\nend",
		);
	});

	it("treats the heading the cursor is on as already passed", () => {
		expect(land(moves.headingMove(lines, "previous"), "# a\ntext\n## b|\nmore")).toBe("# a|\ntext\n## b\nmore");
	});

	it("falls back to the document edges when no heading is left", () => {
		expect(land(moves.headingMove(lines, "next"), "# a\ntext\n## b\nmore\n### c|\nend")).toBe(
			`${doc.slice(0, doc.length)}|`,
		);
		expect(land(moves.headingMove(() => [], "previous"), "x\ny|")).toBe("x|\ny");
	});

	it("counts: two headings on", () => {
		expect(land(moves.headingMove(lines, "next"), "|# a\ntext\n## b\nmore\n### c\nend", 2)).toBe(
			"# a\ntext\n## b\nmore\n### c|\nend",
		);
	});

	it("does not throw when the cache lists a heading past the end of the document", () => {
		const stale = () => [0, 99];

		expect(land(moves.headingMove(stale, "next"), "# a\nb|")).toBe("# a\nb|");
		expect(land(moves.headingMove(stale, "next"), "|# a\nb")).toBe("# a\nb|");
	});
});
