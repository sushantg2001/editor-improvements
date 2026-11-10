import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

/** A harness that records, for every transaction, whether it asked to scroll the cursor into view. */
function watched(doc: string) {
	const t = moduleHarness(editorShortcutsModule, doc);
	const scrolls: boolean[] = [];
	t.view.dispatch({
		effects: StateEffect.appendConfig.of(
			EditorView.updateListener.of((update) => {
				for (const transaction of update.transactions) {
					scrolls.push(transaction.scrollIntoView);
				}
			}),
		),
	});
	scrolls.length = 0;
	return { t, scrolls };
}

const LONG = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");

describe("moving the cursor far away", () => {
	it("scrolls to it when a motion runs from the palette", () => {
		const { t, scrolls } = watched(LONG);
		press(t.cm, "G");
		scrolls.length = 0;

		t.invoke("goToFirstLine");

		expect(t.cursor()).toBe(0);
		expect(scrolls).toContain(true);
	});

	it("scrolls to it when a selection command places the selection", () => {
		const { t, scrolls } = watched(LONG);

		t.invoke("selectToNextWord");

		expect(t.selection().head).toBeGreaterThan(0);
		expect(scrolls).toContain(true);
	});

	it("scrolls to it when an edit changes the document", () => {
		const { t, scrolls } = watched(LONG);
		press(t.cm, "G");
		scrolls.length = 0;

		t.invoke("insertLineBelow");

		expect(scrolls).toContain(true);
	});
});
