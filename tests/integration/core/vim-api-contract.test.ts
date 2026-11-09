import { describe, expect, it } from "vitest";

import { makeEditor, vimApi } from "../../helpers/vim";
import type { CodeMirrorShim, VimApi } from "../../../src/types";

/**
 * Everything `VimApi` and `CodeMirrorShim` claim, checked against the real
 * addon.
 *
 * Unit tests stand in for vim with objects built from these same types, so a
 * method the types invent passes them and fails only in Obsidian. That is how
 * `enterInsertMode` shipped: it was in the type, in the mock, and not in vim.
 *
 * Each record below is exhaustive on purpose. Adding a member to the interface
 * without listing it here is a type error, so the check cannot fall behind.
 */

const VIM_API_METHODS: Record<keyof VimApi, true> = {
	map: true,
	noremap: true,
	unmap: true,
	mapclear: true,
	mapCommand: true,
	defineMotion: true,
	defineAction: true,
	defineOperator: true,
	defineEx: true,
	defineOption: true,
	defineRegister: true,
	getRegisterController: true,
	handleEx: true,
	handleKey: true,
	setOption: true,
	getOption: true,
	exitInsertMode: true,
	exitVisualMode: true,
};

const SHIM_METHODS: Record<Exclude<keyof CodeMirrorShim, "state" | "curOp">, true> = {
	getInputField: true,
	on: true,
	off: true,
	listSelections: true,
	setCursor: true,
	operation: true,
};

describe("the real vim addon provides what our types claim", () => {
	it.each(Object.keys(VIM_API_METHODS))("Vim.%s is a function", (name) => {
		expect(typeof (vimApi as unknown as Record<string, unknown>)[name]).toBe("function");
	});

	it.each(Object.keys(SHIM_METHODS))("the editor shim has %s()", (name) => {
		const { cm } = makeEditor("text");

		expect(typeof (cm as unknown as Record<string, unknown>)[name]).toBe("function");
	});

	it("keeps vim's state on the shim", () => {
		const { cm } = makeEditor("text");

		expect(cm.state.vim).toBeDefined();
	});

	it("exposes the registers the docs rely on", () => {
		const registers = vimApi.getRegisterController();

		for (const name of ['"', "+"]) {
			expect(registers.getRegister(name).toString).toBeTypeOf("function");
		}
	});
});
