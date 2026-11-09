import { afterEach, describe, expect, it } from "vitest";

import { getVimMode } from "../../../src/core/editor";
import { makeEditor, press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

const DOC = "alpha\nbravo\ncharlie";

/**
 * These pin down a behaviour the plugin *relies on not having to fix*.
 *
 * The obvious assumption — and the one this plugin was originally designed
 * around — is that linewise visual mode leaves CodeMirror holding a narrower
 * character range than vim's own linewise range, so any command reading
 * `editor.getSelection()` would see a partial selection. That is false.
 * `makeCmSelection` expands `'line'` mode to whole lines itself, in both
 * `@replit/codemirror-vim` and the byte-identical copy Obsidian bundles.
 *
 * If a future version changes that, these fail and the compensating code has
 * to come back.
 */
describe("linewise visual mode expands the CodeMirror selection on its own", () => {
	it("selects the whole line on V, even with the cursor mid-line", () => {
		const { cm, view } = makeEditor(DOC);
		press(cm, "l", "l", "V");

		const { from, to } = view.state.selection.main;
		expect(view.state.doc.sliceString(from, to)).toBe("alpha");
	});

	it("reports mode as 'visual line', not 'visual'", () => {
		const { cm } = makeEditor(DOC);
		press(cm, "V");

		expect(cm.state.vim?.mode).toBe("visual line");
		expect(cm.state.vim?.visualLine).toBe(true);
	});

	it("keeps the selection line-aligned as the range grows", () => {
		const { cm, view } = makeEditor(DOC);
		press(cm, "l", "l", "V", "j");

		const { from, to } = view.state.selection.main;
		expect(from).toBe(view.state.doc.line(1).from);
		// Ends at a line boundary rather than the cursor's column.
		expect(to).toBe(view.state.doc.lineAt(to).to);
	});

	it("excludes the trailing newline, which vim's own linewise delete includes", () => {
		// The one real difference, documented in SelectionService. Nothing
		// depends on it yet; this records it so a regression is visible.
		const { cm, view } = makeEditor(DOC);
		press(cm, "V");

		const { to } = view.state.selection.main;
		expect(to).toBe(view.state.doc.line(1).to);
		expect(view.state.doc.sliceString(to, to + 1)).toBe("\n");
	});

	it("leaves charwise visual mode as a character range", () => {
		const { cm, view } = makeEditor(DOC);
		press(cm, "v", "l", "l");

		const { from, to } = view.state.selection.main;
		expect(from).toBe(0);
		expect(to).toBeLessThan(view.state.doc.line(1).to);
	});
});

describe("getVimMode against every real mode", () => {
	const cases: [string[], string][] = [
		[[], "normal"],
		[["i"], "insert"],
		[["v"], "visual"],
		[["V"], "visual-line"],
		[["<C-v>"], "visual-block"],
		[["R"], "replace"],
	];

	for (const [keys, expected] of cases) {
		it(`reports ${expected}`, () => {
			const { cm } = makeEditor(DOC);
			press(cm, ...keys);
			expect(getVimMode(cm)).toBe(expected);
		});
	}

	it("returns to normal after Escape", () => {
		const { cm } = makeEditor(DOC);
		press(cm, "V");
		expect(getVimMode(cm)).toBe("visual-line");

		press(cm, "<Esc>");
		expect(getVimMode(cm)).toBe("normal");
	});
});
