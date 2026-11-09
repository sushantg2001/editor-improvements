import { afterEach, describe, expect, it } from "vitest";

import { getVimMode } from "../../src/core/editor";
import { builtinContribution } from "../../src/modules/builtin";
import { makeEditor, press, vimApi } from "./helpers";
import type { VimActionDef } from "../../src/types";

afterEach(() => {
	vimApi.mapclear();
});

function find(id: string): VimActionDef {
	const contribution = builtinContribution({
		app: {} as never,
		getVim: () => vimApi,
	});
	const def = (contribution.actions ?? []).find((a: VimActionDef) => a.id === id);
	if (!def) {
		throw new Error(`no builtin action ${id}`);
	}
	return def;
}

const DOC = "alpha\nbravo\ncharlie";

describe("Select all", () => {
	it("selects the whole document from normal mode", () => {
		const { cm, view, ctx } = makeEditor(DOC);

		void find("selectAll").run({ ...ctx, cm, mode: "normal" }, { repeat: 1 });

		const { from, to } = view.state.selection.main;
		expect(view.state.doc.sliceString(from, to)).toBe(DOC);
	});

	it("lands in linewise visual mode rather than a dead selection", () => {
		// The reason it routes through `:normal ggVG` instead of dispatching a
		// CodeMirror selection: in normal mode vim ignores a plain selection.
		const { cm, ctx } = makeEditor(DOC);

		void find("selectAll").run({ ...ctx, cm, mode: "normal" }, { repeat: 1 });

		expect(getVimMode(cm)).toBe("visual-line");
	});

	it("still selects everything when the cursor starts mid-document", () => {
		const { cm, view, ctx } = makeEditor(DOC);
		press(cm, "j", "l", "l");

		void find("selectAll").run({ ...ctx, cm, mode: "normal" }, { repeat: 1 });

		const { from, to } = view.state.selection.main;
		expect(view.state.doc.sliceString(from, to)).toBe(DOC);
	});

	it("works on a single-line document", () => {
		const { cm, view, ctx } = makeEditor("only");

		void find("selectAll").run({ ...ctx, cm, mode: "normal" }, { repeat: 1 });

		const { from, to } = view.state.selection.main;
		expect(view.state.doc.sliceString(from, to)).toBe("only");
	});

	it("does not throw on an empty document", () => {
		const { cm, ctx } = makeEditor("");

		expect(() =>
			find("selectAll").run({ ...ctx, cm, mode: "normal" }, { repeat: 1 }),
		).not.toThrow();
	});

	it("falls back to a plain selection in insert mode", () => {
		// `:normal` would fight insert mode, so the action takes the CM path.
		const { cm, view, ctx } = makeEditor(DOC);
		press(cm, "i");

		void find("selectAll").run({ ...ctx, cm, mode: "insert" }, { repeat: 1 });

		const { from, to } = view.state.selection.main;
		expect(from).toBe(0);
		expect(to).toBe(view.state.doc.length);
	});
});
