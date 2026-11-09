import { describe, expect, it } from "vitest";

import {
	findEnclosures,
	findOccurrences,
	groupBoundary,
	isWholeWord,
	nextCase,
	toTitleCase,
	transformCase,
	wordRangeAt,
} from "../../../../src/modules/editor-shortcuts/text";
import { stateOf } from "../../../helpers/state";

describe("wordRangeAt", () => {
	it("finds the word around or touching a column", () => {
		expect(wordRangeAt("one two three", 5)).toEqual([4, 7]);
		expect(wordRangeAt("one two three", 4)).toEqual([4, 7]);
		expect(wordRangeAt("one two three", 7)).toEqual([4, 7]);
	});

	it("is empty between non-word characters", () => {
		expect(wordRangeAt("a  b", 2)).toEqual([2, 2]);
		expect(wordRangeAt("", 0)).toEqual([0, 0]);
	});

	it("counts letters in any script and digits as word characters", () => {
		expect(wordRangeAt("héllo wörld 42", 1)).toEqual([0, 5]);
		expect(wordRangeAt("日本語 text", 1)).toEqual([0, 3]);
		expect(wordRangeAt("abc42", 3)).toEqual([0, 5]);
	});
});

describe("case", () => {
	it("title-cases but leaves short articles lowercase in the middle", () => {
		expect(toTitleCase("the lord of the rings")).toBe("The Lord Of the Rings");
		expect(toTitleCase("a tale of two cities")).toBe("A Tale Of Two Cities");
	});

	it("keeps the original whitespace between words", () => {
		expect(toTitleCase("one   two\tthree")).toBe("One   Two\tThree");
	});

	it("cycles UPPER -> lower -> Title -> UPPER", () => {
		expect(nextCase("HELLO WORLD")).toBe("hello world");
		expect(nextCase("hello world")).toBe("Hello World");
		expect(nextCase("Hello World")).toBe("HELLO WORLD");
		expect(nextCase("hELLO wORLD")).toBe("HELLO WORLD");
	});

	it("applies each transform", () => {
		expect(transformCase("aB", "upper")).toBe("AB");
		expect(transformCase("aB", "lower")).toBe("ab");
		expect(transformCase("aB cD", "title")).toBe("Ab Cd");
		expect(transformCase("ab", "next")).toBe("Ab");
	});
});

describe("groupBoundary", () => {
	const at = (marked: string, forward: boolean) => {
		const state = stateOf(marked);
		return groupBoundary(state, state.selection.main.head, forward);
	};

	it("moves over a run of word characters", () => {
		expect(at("|foo bar", true)).toBe(3);
		expect(at("foo bar|", false)).toBe(4);
	});

	it("absorbs the whitespace in front of the next group", () => {
		expect(at("foo| bar", true)).toBe(7);
		expect(at("foo |bar", false)).toBe(0);
	});

	it("treats punctuation as its own group", () => {
		expect(at("|foo.bar", true)).toBe(3);
		expect(at("foo|.bar", true)).toBe(4);
		expect(at("foo.bar|", false)).toBe(4);
	});

	it("crosses a line break", () => {
		expect(at("foo|\nbar", true)).toBe(7);
		expect(at("foo\n|bar", false)).toBe(0);
	});

	it("stops at the ends of the document", () => {
		expect(at("|", true)).toBe(0);
		expect(at("|abc", false)).toBe(0);
		expect(at("abc|", true)).toBe(3);
	});
});

describe("findOccurrences", () => {
	it("finds every occurrence, overlapping ones apart", () => {
		expect(findOccurrences("a cat, a cat", "cat", false)).toEqual([2, 9]);
	});

	it("matches whole words only when asked", () => {
		expect(findOccurrences("cat concat cat_x cat", "cat", true)).toEqual([0, 17]);
		expect(findOccurrences("cat concat", "cat", false)).toEqual([0, 7]);
	});

	it("treats regex characters in the needle literally", () => {
		expect(findOccurrences("a.b axb a.b", "a.b", false)).toEqual([0, 8]);
		expect(findOccurrences("(x) (x)", "(x)", false)).toEqual([0, 4]);
	});

	it("finds nothing for an empty needle", () => {
		expect(findOccurrences("abc", "", false)).toEqual([]);
	});

	it("knows what a whole word is", () => {
		expect(isWholeWord("héllo")).toBe(true);
		expect(isWholeWord("two words")).toBe(false);
		expect(isWholeWord("")).toBe(false);
	});
});

describe("findEnclosures", () => {
	it("lists nested brackets innermost first", () => {
		const text = "f(a, [b], (c d))";
		const from = text.indexOf("c");

		const found = findEnclosures(text, from, from, "brackets");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(["(c d)", "(a, [b], (c d))"]);
	});

	it("ignores a bracket that closes before the cursor", () => {
		// The reason the old forward search paired the wrong brackets here.
		const text = "(a (b) c)";
		const from = text.indexOf("c");

		const found = findEnclosures(text, from, from, "brackets");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(["(a (b) c)"]);
	});

	it("spans lines for brackets", () => {
		const text = "{\n  x\n}";

		const found = findEnclosures(text, 4, 4, "brackets");

		expect(found).toEqual([{ open: 0, close: 6 }]);
	});

	it("pairs quotes within the line", () => {
		const text = 'say "hi" and "bye"';
		const from = text.indexOf("bye");

		const found = findEnclosures(text, from, from, "quotes");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(['"bye"']);
	});

	it("does not pair quotes across lines", () => {
		const text = '"open\nclosed"';

		expect(findEnclosures(text, 2, 2, "quotes")).toEqual([]);
	});

	it("mixes quotes and brackets, smallest first", () => {
		const text = 'x("a b")';
		const from = text.indexOf("b");

		const found = findEnclosures(text, from, from, "both");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(['"a b"', '("a b")']);
	});

	it("finds nothing outside any delimiter", () => {
		expect(findEnclosures("plain text", 3, 3, "both")).toEqual([]);
	});
});
