import { describe, expect, it } from "vitest";

import { normalizeKeys, tokenizeKeys } from "../../../src/core/keys";

describe("tokenizeKeys at the edges of what counts as a key name", () => {
	it("looks for the closing bracket after the opening one, not before it", () => {
		expect(tokenizeKeys("><C-h>")).toEqual([">", "<C-h>"]);
		expect(tokenizeKeys("a><Esc>")).toEqual(["a", ">", "<Esc>"]);
	});

	it("does not take a name with a space in it for a key", () => {
		expect(tokenizeKeys("<a b>")).toEqual(["<", "a", " ", "b", ">"]);
	});

	it("does not take one character between brackets for a key name", () => {
		expect(tokenizeKeys("<a>")).toEqual(["<", "a", ">"]);
		expect(tokenizeKeys("<%>")).toEqual(["<", "%", ">"]);
	});

	it("still takes a two-character name", () => {
		expect(tokenizeKeys("<BS>")).toEqual(["<BS>"]);
		expect(tokenizeKeys("<F5>")).toEqual(["<F5>"]);
	});
});

describe("normalizeKeys leaves a lone angle bracket alone", () => {
	it("whatever follows it", () => {
		expect(normalizeKeys("<", { literalSpace: true })).toBe("<");
		expect(normalizeKeys("<a>", { literalSpace: true })).toBe("<a>");
	});
});
