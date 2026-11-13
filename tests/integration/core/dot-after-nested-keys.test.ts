import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, modeOf, press, vimApi } from "../../helpers/vim";
import type { VimActionDef } from "../../../src/types";

afterEach(() => {
	vimApi.mapclear();
});

function harness(doc: string, defs: VimActionDef[]) {
	const editor = makeEditor(doc);
	const registry = new ActionRegistry();
	registry.set("test", { actions: defs });
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings);
	return { ...editor, text: () => editor.view.state.doc.toString() };
}

/** Prepends X, and leaves vim in insert mode, as a command like "insert here" would. */
const prependX: VimActionDef = {
	id: "prependX",
	name: "Prepend X",
	group: "Test",
	kind: "action",
	isEdit: true,
	resultMode: "insert",
	defaultKeys: [{ keys: "gi", contexts: ["normal"] }],
	run: (ctx) => {
		ctx.view.dispatch({ changes: { from: 0, insert: "X" } });
	},
};

describe("the dot command after a command that sends keys to vim", () => {
	it("repeats the command, not the key it sent to get into insert mode", () => {
		const t = harness("ab", [prependX]);

		press(t.cm, "g", "i");
		expect(modeOf(t.cm)).toBe("insert");
		press(t.cm, "<Esc>");
		press(t.cm, ".");

		expect(t.text()).toBe("XXab");
	});

	it("keeps repeating it", () => {
		const t = harness("ab", [prependX]);

		press(t.cm, "g", "i", "<Esc>", ".");
		press(t.cm, "<Esc>");
		press(t.cm, ".");

		expect(t.text()).toBe("XXXab");
	});

	it("leaves an earlier edit as what dot repeats when the command is not an edit", () => {
		const notAnEdit: VimActionDef = { ...prependX, id: "notAnEdit", isEdit: false, defaultKeys: [{ keys: "gj", contexts: ["normal"] }] };
		const t = harness("abc def", [notAnEdit]);

		press(t.cm, "x");
		expect(t.text()).toBe("bc def");
		press(t.cm, "g", "j", "<Esc>");
		expect(t.text()).toBe("Xbc def");

		// Dot repeats the x before it, on the X the command put under the cursor.
		press(t.cm, ".");

		expect(t.text()).toBe("bc def");
	});
});
