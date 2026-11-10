import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";
import { findEnclosures } from "../../../../src/modules/editor-shortcuts/text";
import { run } from "../../../helpers/state";

/**
 * Behaviour that mutating the source went unnoticed on: each test below fails
 * if the comparison or arithmetic it covers is changed.
 */

describe("expanding a selection to its enclosure", () => {
	it("goes from the text inside quotes to the quotes as well", () => {
		// The selection ends exactly at the closing quote.
		expect(run(edits.expandToEnclosure("quotes"), 'say "«hi»" now')).toBe('say «"hi"» now');
	});

	it("grows when only the end moves, a selection that already starts inside the pair", () => {
		expect(run(edits.expandToEnclosure("brackets"), "(«b»c)")).toBe("(«bc»)");
	});

	it("grows when only the start moves, a selection that already ends at the closer", () => {
		expect(run(edits.expandToEnclosure("brackets"), "(b«c»)")).toBe("(«bc»)");
	});

	it("does not grow into the pair it is already exactly", () => {
		// "(bc)" selected whole is not enclosed by itself; with no outer pair it stays.
		expect(run(edits.expandToEnclosure("brackets"), "«(bc)»")).toBe("«(bc)»");
	});
});

describe("quotes are paired within their own line", () => {
	it("ignores a stray quote on an earlier line", () => {
		const text = 'a stray " quote\n"a b" here';
		const from = text.indexOf("b");

		const found = findEnclosures(text, from, from, "quotes");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(['"a b"']);
	});

	it("ignores a stray quote on a later line", () => {
		const text = '"a b" here\nanother " stray';
		const from = text.indexOf("b");

		const found = findEnclosures(text, from, from, "quotes");

		expect(found.map((e) => text.slice(e.open, e.close + 1))).toEqual(['"a b"']);
	});

	it("pairs quotes at the very start of the text", () => {
		const found = findEnclosures('"ab" c', 2, 2, "quotes");

		expect(found).toEqual([{ open: 0, close: 3 }]);
	});
});

describe("selecting the next occurrence of a selection at the end of the text", () => {
	it("treats the end of the text as a word boundary", () => {
		expect(run(edits.selectNextOccurrence, "cat x «cat»")).toBe("«cat» x cat");
	});

	it("sees the character after a selection that is not at the end", () => {
		// «ca» is followed by "t", so it is not a whole word and matches inside words.
		expect(run(edits.selectNextOccurrence, "«ca»t concat")).toBe("cat con«ca»t");
	});
});
