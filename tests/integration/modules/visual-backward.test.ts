import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

describe("a motion run from the palette in visual mode, going back past the anchor", () => {
	it("keeps the character the selection started on", () => {
		const t = moduleHarness(editorShortcutsModule, "abcdefgh");
		press(t.cm, "l", "l", "l", "v");

		t.invoke("goToPrevChar");
		t.invoke("goToPrevChar");
		t.invoke("goToPrevChar");
		press(t.cm, "d");

		// Anchor on d (offset 3); head walked back to a: a, b, c, d are selected.
		expect(t.text()).toBe("efgh");
	});

	it("keeps it when the head crosses the anchor in one move", () => {
		const t = moduleHarness(editorShortcutsModule, "abcdefgh");
		press(t.cm, "l", "l", "l", "v");

		t.invoke("goToFirstLine");
		press(t.cm, "d");

		expect(t.text()).toBe("efgh");
	});

	it("extends forwards again after going back", () => {
		const t = moduleHarness(editorShortcutsModule, "abcdefgh");
		press(t.cm, "l", "l", "l", "v");
		t.invoke("goToPrevChar");
		t.invoke("goToPrevChar");

		t.invoke("goToNextChar");
		t.invoke("goToNextChar");
		t.invoke("goToNextChar");
		press(t.cm, "d");

		// Back to b, then three forward: c, the anchor d, and one past it, e. The
		// selection runs from the anchor to e, so d and e are selected.
		expect(t.text()).toBe("abcfgh");
	});
});
