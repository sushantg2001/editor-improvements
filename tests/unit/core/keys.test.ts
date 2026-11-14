import { describe, expect, it } from "vitest";

import { describeKeysProblem, normalizeKeys, tokenizeKeys } from "../../../src/core/keys";

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

describe("normalizeKeys", () => {
	const listen = (keys: string) => normalizeKeys(keys, { literalSpace: true });
	const type = (keys: string) => normalizeKeys(keys, { literalSpace: false });

	it("spells a literal space, tab and newline the way the addon names those keys", () => {
		expect(listen(" d")).toBe("<Space>d");
		expect(listen("g ")).toBe("g<Space>");
		expect(listen("\tx")).toBe("<Tab>x");
		expect(listen("\n")).toBe("<CR>");
	});

	it("leaves whitespace alone in what a mapping types, which may be an ex command", () => {
		expect(type(":s/a b/c/<CR>")).toBe(":s/a b/c/<CR>");
	});

	it.each([
		["<space>", "<Space>"],
		["<SPACE>", "<Space>"],
		["<cr>", "<CR>"],
		["<Enter>", "<CR>"],
		["<return>", "<CR>"],
		["<esc>", "<Esc>"],
		["<Escape>", "<Esc>"],
		["<tab>", "<Tab>"],
		["<bs>", "<BS>"],
		["<Backspace>", "<BS>"],
		["<delete>", "<Del>"],
		["<Insert>", "<Ins>"],
		["<up>", "<Up>"],
		["<LEFT>", "<Left>"],
		["<pageup>", "<PageUp>"],
		["<f5>", "<F5>"],
	])("canonicalises %s to %s, on both sides of a mapping", (written, canonical) => {
		expect(listen(`${written}d`)).toBe(`${canonical}d`);
		expect(type(`${written}d`)).toBe(`${canonical}d`);
	});

	it.each([
		["<c-h>", "<C-h>"],
		["<C-H>", "<C-h>"],
		["<a-j>", "<A-j>"],
		["<m-j>", "<M-j>"],
		["<c-space>", "<C-Space>"],
		["<s-tab>", "<S-Tab>"],
		["<A-C-x>", "<C-A-x>"],
		["<S-C-X>", "<C-S-X>"],
		// The editor names Ctrl+Shift+x with a capital, whatever case the mapping was written in.
		["<C-S-x>", "<C-S-X>"],
		["<A-S-j>", "<A-S-J>"],
		// Shift alone makes no modifier: Shift+x is the key X.
		["<S-x>", "X"],
		["<S-X>", "X"],
		// Not a letter: nothing to know about the shifted key, so left as written.
		["<S-1>", "<S-1>"],
	])("canonicalises the modifiers of %s to %s", (written, canonical) => {
		expect(listen(written)).toBe(canonical);
	});

	it.each([
		["<lt>", "<"],
		["<LT>", "<"],
		["<Bar>", "|"],
		["<bar>", "|"],
		["<Bslash>", "\\"],
	])("replaces vim's name %s with the character the addon knows", (name, character) => {
		expect(listen(`g${name}`)).toBe(`g${character}`);
	});

	it("leaves everything it does not recognise as written", () => {
		for (const keys of ["jk", "<C-h>", "<CR>", "<Esc>", "<A-j>", "gd", "S\"", "[[", "<Plug>x", "<C-F5>"]) {
			expect(listen(keys)).toBe(keys);
		}
	});

	it("handles an empty string", () => {
		expect(listen("")).toBe("");
	});
});
