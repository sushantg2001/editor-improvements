import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

describe("a command run with no editor open", () => {
	it("still toggles a vault setting, which has nothing to do with the editor", () => {
		const t = moduleHarness(editorShortcutsModule, "text");
		const before = t.app.vault.getConfig("showLineNumber");

		t.dispatcher.invoke("toggle-line-numbers", null);
		expect(t.app.vault.getConfig("showLineNumber")).toBe(!before);

		t.dispatcher.invoke("indent-using-tabs", null);
		expect(t.app.vault.getConfig("useTab")).toBe(true);
		t.dispatcher.invoke("indent-using-spaces", null);
		expect(t.app.vault.getConfig("useTab")).toBe(false);
	});

	it("does nothing for a command that edits the text", () => {
		const t = moduleHarness(editorShortcutsModule, "text");

		t.dispatcher.invoke("insertLineBelow", null);

		expect(t.text()).toBe("text");
	});
});
