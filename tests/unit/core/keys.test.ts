import { describe, expect, it } from "vitest";

import { describeKeysProblem, tokenizeKeys } from "../../../src/core/keys";

describe("tokenizeKeys", () => {
	it("keeps <...> specials whole and splits everything else per character", () => {
		expect(tokenizeKeys("<C-w>j")).toEqual(["<C-w>", "j"]);
		expect(tokenizeKeys("gdd")).toEqual(["g", "d", "d"]);
		expect(tokenizeKeys("<leader>ab")).toEqual(["<leader>", "a", "b"]);
	});

	it("treats a lone < or an unclosed one as a literal", () => {
		expect(tokenizeKeys("<")).toEqual(["<"]);
		expect(tokenizeKeys("<<")).toEqual(["<", "<"]);
		expect(tokenizeKeys("<Esc")).toEqual(["<", "E", "s", "c"]);
	});

	it("keeps astral characters in one piece", () => {
		expect(tokenizeKeys("a😀b")).toEqual(["a", "😀", "b"]);
	});
});

describe("describeKeysProblem", () => {
	it.each([
		"jk",
		"<Esc>",
		"<C-h>",
		"<C-S-x>",
		"<A-j>",
		"<M-Space>",
		"<F5>",
		"<leader>d",
		"<CR>",
		"<BS>",
		"<C-'>",
		"<C-/>",
		"S\"",
		"g<",
		"[[",
		" ",
	])("accepts %s", (keys) => {
		expect(describeKeysProblem(keys)).toBeNull();
	});

	it("rejects an empty sequence", () => {
		expect(describeKeysProblem("")).toMatch(/empty/);
	});

	it("rejects whitespace that is not a single space", () => {
		expect(describeKeysProblem("  ")).toMatch(/whitespace/);
	});

	it("names a misspelt special, which vim would silently take as literals", () => {
		expect(describeKeysProblem("<Escape>")).toBe("<Escape> is not a vim key name");
		expect(describeKeysProblem("a<Contrl-x>")).toMatch(/<Contrl-x>/);
	});
});
