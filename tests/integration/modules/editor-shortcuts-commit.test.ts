import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

const h = (doc: string) => moduleHarness(editorShortcutsModule, doc);

describe("finishing an edit", () => {
	it("leaves vim's last visual selection alone when the edit ran in normal mode", () => {
		const t = h("one two\nthree four");
		t.bind("go", "insertLineBelow");
		// A linewise selection, left again: `gv` brings back a linewise selection.
		press(t.cm, "V", "V");
		press(t.cm, "G");

		press(t.cm, "g", "o");
		press(t.cm, "<Esc>", "g", "v");

		expect(t.cm.state.vim?.visualMode).toBe(true);
		expect(t.cm.state.vim?.visualLine).toBe(true);
	});

	it("still remembers the selection it ended when the edit ran in visual mode", () => {
		const t = h("one two\nthree four");
		t.bind("gd", "deleteLine");
		press(t.cm, "V", "g", "d");
		press(t.cm, "g", "v");

		expect(t.cm.state.vim?.visualMode).toBe(true);
		expect(t.cm.state.vim?.visualLine).toBe(true);
	});
});
