import { describe, expect, it } from "vitest";

import { isInsertLike, isVisual } from "../../../src/core/vim-modes";
import type { CodeMirrorShim } from "../../../src/types";

const cm = (vim: Record<string, unknown> | undefined) => ({ state: { vim } }) as unknown as CodeMirrorShim;

describe("insert-like modes", () => {
	it("are recognised from vim's insert flag alone", () => {
		expect(isInsertLike(cm({ insertMode: true }))).toBe(true);
	});

	it("are recognised from the mode name alone", () => {
		expect(isInsertLike(cm({ mode: "insert" }))).toBe(true);
		expect(isInsertLike(cm({ mode: "replace" }))).toBe(true);
	});

	it("do not include normal or visual mode", () => {
		expect(isInsertLike(cm({ mode: "normal", insertMode: false }))).toBe(false);
		expect(isInsertLike(cm({ mode: "visual", visualMode: true }))).toBe(false);
	});

	it("are not claimed before vim has a state", () => {
		expect(isInsertLike(cm(undefined))).toBe(false);
	});
});

describe("visual modes", () => {
	it("are recognised from vim's visual flag", () => {
		expect(isVisual(cm({ visualMode: true }))).toBe(true);
		expect(isVisual(cm({ visualMode: false }))).toBe(false);
		expect(isVisual(cm(undefined))).toBe(false);
	});
});
