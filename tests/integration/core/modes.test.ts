import { afterEach, describe, expect, it } from "vitest";

import { ModeTracker } from "../../../src/core/modes";
import { App, MarkdownView } from "../../mocks/obsidian";
import { makeEditor, press, vimApi } from "../../helpers/vim";
import type { VimMode } from "../../../src/types";

afterEach(() => {
	vimApi.mapclear();
});

function track(doc = "alpha\nbravo") {
	const editor = makeEditor(doc);
	const app = new App();
	const view = Object.assign(editor.view, { cm: editor.cm });
	const markdown = new MarkdownView();
	markdown.editor = { cm: view };
	app.workspace.activeView = markdown;

	const tracker = new ModeTracker(app as never);
	tracker.load();
	tracker.attachToActiveEditor();

	const seen: VimMode[] = [];
	tracker.onChange((mode) => seen.push(mode));
	return { ...editor, tracker, seen };
}

describe("ModeTracker against the real Vim addon", () => {
	it.each([
		["i", "insert"],
		["R", "replace"],
		["v", "visual"],
		["V", "visual-line"],
		["<C-v>", "visual-block"],
	] as const)("follows %s into %s", (key, mode) => {
		const t = track();

		press(t.cm, key);

		expect(t.tracker.current).toBe(mode);
	});

	it("returns to normal on Escape from every mode", () => {
		for (const key of ["i", "R", "v", "V", "<C-v>"]) {
			const t = track();

			press(t.cm, key, "<Esc>");

			expect(t.tracker.current, key).toBe("normal");
		}
	});

	it("tells listeners about each change, once", () => {
		const t = track();
		t.seen.length = 0;

		press(t.cm, "V", "<Esc>");

		expect(t.seen).toEqual(["visual-line", "normal"]);
	});
});
