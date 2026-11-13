import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";
import { run } from "../../../helpers/state";

const lists = { continueLists: true };
const plain = { continueLists: false };

describe("insertLineBelow", () => {
	it("opens a line below and puts the cursor on it", () => {
		expect(run(edits.insertLineBelow(plain), "al|pha\nbravo")).toBe("alpha\n|\nbravo");
	});

	it("keeps the indentation", () => {
		expect(run(edits.insertLineBelow(plain), "  al|pha")).toBe("  alpha\n  |");
	});

	it("continues a bullet list", () => {
		expect(run(edits.insertLineBelow(lists), "- a|")).toBe("- a\n- |");
	});

	it("continues an ordered list and renumbers what follows", () => {
		expect(run(edits.insertLineBelow(lists), "1. a|\n2. b\n3. c\nx")).toBe(
			"1. a\n2. |\n3. b\n4. c\nx",
		);
	});

	it("continues a task unticked", () => {
		expect(run(edits.insertLineBelow(lists), "- [x] done|")).toBe("- [x] done\n- [ ] |");
	});

	it("ends the list on an empty item instead of continuing it", () => {
		expect(run(edits.insertLineBelow(lists), "- a\n- |")).toBe("- a\n|");
	});

	it("does not continue a list when the setting is off", () => {
		expect(run(edits.insertLineBelow(plain), "- a|")).toBe("- a\n|");
	});

	it("works on the last line with no trailing newline", () => {
		expect(run(edits.insertLineBelow(plain), "only|")).toBe("only\n|");
	});

	it("opens one line per cursor", () => {
		expect(run(edits.insertLineBelow(plain), "a|\nb|")).toBe("a\n|\nb\n|");
	});
});

describe("insertLineAbove", () => {
	it("opens a line above and puts the cursor on it", () => {
		expect(run(edits.insertLineAbove(plain), "alpha\nbr|avo")).toBe("alpha\n|\nbravo");
	});

	it("works on the first line", () => {
		expect(run(edits.insertLineAbove(plain), "al|pha")).toBe("|\nalpha");
	});

	it("keeps the indentation", () => {
		expect(run(edits.insertLineAbove(plain), "x\n  y|")).toBe("x\n  |\n  y");
	});

	it("continues a list only inside one", () => {
		expect(run(edits.insertLineAbove(lists), "- a\n- b|")).toBe("- a\n- |\n- b");
		expect(run(edits.insertLineAbove(lists), "text\n\n- b|")).toBe("text\n\n|\n- b");
		expect(run(edits.insertLineAbove(lists), "- b|")).toBe("|\n- b");
	});

	it("renumbers an ordered list from the line pushed down", () => {
		expect(run(edits.insertLineAbove(lists), "1. a\n2. b|\n3. c")).toBe(
			"1. a\n2. |\n3. b\n4. c",
		);
	});
});

describe("deleteLine", () => {
	it("deletes the line and lands on the next one at the same column", () => {
		expect(run(edits.deleteLine, "ab\ncd|ef\ngh")).toBe("ab\ngh|");
	});

	it("clamps the column to a shorter next line", () => {
		expect(run(edits.deleteLine, "ab\ncdef|g\nh")).toBe("ab\nh|");
	});

	it("deletes the last line and the newline before it", () => {
		expect(run(edits.deleteLine, "ab\nc|d")).toBe("a|b");
	});

	it("empties a one-line document", () => {
		expect(run(edits.deleteLine, "on|ly")).toBe("|");
	});

	it("deletes every line a selection touches", () => {
		expect(run(edits.deleteLine, "a\nb«c\nd\ne»f\ng")).toBe("a\ng|");
	});

	it("leaves a line the selection only reaches the start of", () => {
		expect(run(edits.deleteLine, "«a\nb\n»c")).toBe("|c");
	});
});

describe("deleting to a line edge", () => {
	it("deletes to the start of the line", () => {
		expect(run(edits.deleteToStartOfLine, "abc|def")).toBe("|def");
	});

	it("deletes the newline when already at the start of a line", () => {
		expect(run(edits.deleteToStartOfLine, "ab\n|cd")).toBe("ab|cd");
	});

	it("does nothing at the start of the document", () => {
		expect(run(edits.deleteToStartOfLine, "|abc")).toBe("|abc");
	});

	it("deletes to the end of the line", () => {
		expect(run(edits.deleteToEndOfLine, "abc|def\nx")).toBe("abc|\nx");
	});

	it("deletes the newline when already at the end of a line", () => {
		expect(run(edits.deleteToEndOfLine, "ab|\ncd")).toBe("ab|cd");
	});

	it("does nothing at the end of the document", () => {
		expect(run(edits.deleteToEndOfLine, "abc|")).toBe("abc|");
	});
});

describe("deleteWord", () => {
	it("deletes the word before the cursor", () => {
		expect(run(edits.deleteWord("before"), "one two| three")).toBe("one | three");
	});

	it("deletes the word after the cursor, with the space before it", () => {
		expect(run(edits.deleteWord("after"), "one| two three")).toBe("one| three");
	});

	it("deletes a selection instead of a word", () => {
		expect(run(edits.deleteWord("before"), "one «two» three")).toBe("one | three");
	});

	it("does nothing at the edges", () => {
		expect(run(edits.deleteWord("before"), "|abc")).toBe("|abc");
		expect(run(edits.deleteWord("after"), "abc|")).toBe("abc|");
	});
});

describe("joinLines", () => {
	it("joins with one space and puts the cursor at the join", () => {
		expect(run(edits.joinLines, "ab|\ncd")).toBe("ab| cd");
	});

	it("takes the list marker and the indentation off the joined line", () => {
		expect(run(edits.joinLines, "- a|\n- b")).toBe("- a| b");
		expect(run(edits.joinLines, "a|\n    b")).toBe("a| b");
	});

	it("adds no space after a trailing space or before nothing", () => {
		expect(run(edits.joinLines, "a |\nb")).toBe("a |b");
		expect(run(edits.joinLines, "a|\n")).toBe("a|");
	});

	it("adds no leading space to an empty line", () => {
		expect(run(edits.joinLines, "|\nb")).toBe("|b");
	});

	it("joins every line a selection spans", () => {
		expect(run(edits.joinLines, "«a\nb\nc»\nd")).toBe("a| b c\nd");
	});

	it("does nothing on the last line", () => {
		expect(run(edits.joinLines, "a\nb|")).toBe("a\nb|");
	});
});

describe("copyLines", () => {
	it("copies down and moves the cursor to the lower copy", () => {
		expect(run(edits.copyLines("down"), "a\nb|c\nd")).toBe("a\nbc\nb|c\nd");
	});

	it("copies up and keeps the cursor on the upper line", () => {
		expect(run(edits.copyLines("up"), "a\nb|c\nd")).toBe("a\nb|c\nbc\nd");
	});

	it("copies every line a selection touches", () => {
		expect(run(edits.copyLines("down"), "«a\nb»\nc")).toBe("a\nb\n«a\nb»\nc");
	});

	it("works on the last line", () => {
		expect(run(edits.copyLines("up"), "x|")).toBe("x|\nx");
	});
});

describe("selectLines", () => {
	it("selects the line with its newline", () => {
		expect(run(edits.selectLines, "a\nb|c\nd")).toBe("a\n«bc\n»d");
	});

	it("grows by a line when run again", () => {
		expect(run(edits.selectLines, "a\n«bc\n»d")).toBe("a\n«bc\n»d");
	});

	it("stops at the end of the document", () => {
		expect(run(edits.selectLines, "a\nb|")).toBe("a\n«b»");
	});
});

describe("changeCase", () => {
	it("changes the selection", () => {
		expect(run(edits.changeCase("upper"), "a «bc» d")).toBe("a «BC» d");
	});

	it("changes the word under the cursor when nothing is selected", () => {
		expect(run(edits.changeCase("upper"), "one t|wo three")).toBe("one T|WO three");
		expect(run(edits.changeCase("title"), "one t|wo")).toBe("one T|wo");
	});

	it("cycles with toggle", () => {
		expect(run(edits.changeCase("next"), "«hello world»")).toBe("«Hello World»");
	});

	it("does nothing between words", () => {
		expect(run(edits.changeCase("upper"), "a | b")).toBe("a | b");
	});

	it("keeps a selection whose length changes", () => {
		expect(run(edits.changeCase("upper"), "«straße»")).toBe("«STRASSE»");
	});
});

describe("expandToEnclosure", () => {
	it("selects inside the brackets, then the brackets, then the pair around", () => {
		const step1 = run(edits.expandToEnclosure("brackets"), "f(a (b|c) d)");
		expect(step1).toBe("f(a («bc») d)");
		const step2 = run(edits.expandToEnclosure("brackets"), step1 ?? "");
		expect(step2).toBe("f(a «(bc)» d)");
		const step3 = run(edits.expandToEnclosure("brackets"), step2 ?? "");
		expect(step3).toBe("f(«a (bc) d»)");
	});

	it("selects inside quotes", () => {
		expect(run(edits.expandToEnclosure("quotes"), 'say "h|i" now')).toBe('say "«hi»" now');
	});

	it("leaves the selection alone when nothing encloses it", () => {
		expect(run(edits.expandToEnclosure("brackets"), "pl|ain")).toBe("pl|ain");
	});

	it("picks whichever pair is closest when both kinds are allowed", () => {
		expect(run(edits.expandToEnclosure("both"), 'f("a| b")')).toBe('f("«a b»")');
	});
});

describe("selectNextOccurrence", () => {
	it("selects the word under the cursor first", () => {
		expect(run(edits.selectNextOccurrence, "a ca|t b cat")).toBe("a «cat» b cat");
	});

	it("then the next whole-word occurrence, skipping partial matches", () => {
		expect(run(edits.selectNextOccurrence, "«cat» concat cat")).toBe("cat concat «cat»");
	});

	it("matches inside words when the selection is not a whole word", () => {
		expect(run(edits.selectNextOccurrence, "«ca»t concat")).toBe("cat con«ca»t");
	});

	it("wraps around to the first occurrence", () => {
		expect(run(edits.selectNextOccurrence, "cat x «cat»")).toBe("«cat» x cat");
	});

	it("does nothing when there is only the one", () => {
		expect(run(edits.selectNextOccurrence, "«cat» dog")).toBeNull();
	});

	it("does nothing off a word", () => {
		expect(run(edits.selectNextOccurrence, "a | b")).toBeNull();
	});
});

describe("selectByWord", () => {
	it("extends the head by a word", () => {
		expect(run(edits.selectByWord("after"), "a |bc de")).toBe("a «bc» de");
	});

	it("extends backwards, keeping the anchor", () => {
		expect(run(edits.selectByWord("before"), "ab cd|")).toBe("ab «cd»");
	});

	it("keeps growing on repeat", () => {
		expect(run(edits.selectByWord("after"), "ab «cd» ef")).toBe("ab «cd ef»");
	});
});
