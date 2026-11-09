import { describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, press, vimApi } from "../../helpers/vim";

/**
 * Vim's keymap belongs to the process, not to the plugin. A built-in removed
 * with unmap stays removed when the plugin is turned off and on, and turning it
 * on builds a new ledger that has never heard of the removal. Removing "the
 * built-in S" a second time would take away whatever else is now bound to S.
 *
 * This file removes built-ins for good, so it does not use mapclear, which
 * counts on the built-ins all being there; each test undoes its own mappings.
 */

const UNMAPS = [{ keys: "S", contexts: ["normal" as const] }];

function ledgerFor(editor: ReturnType<typeof makeEditor>) {
	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	return { ledger: new MappingLedger(), dispatcher };
}

describe("unmap across a disable and enable of the plugin", () => {
	it("removes a built-in that no earlier ledger touched", () => {
		const editor = makeEditor("hello");
		const { ledger, dispatcher } = ledgerFor(editor);

		ledger.apply(vimApi, dispatcher, [], [{ keys: "gJ", contexts: ["normal"] }]);
		press(editor.cm, "g", "J");

		// gJ (join without a space) is gone from normal mode, so nothing joined.
		expect(editor.view.state.doc.toString()).toBe("hello");
	});

	it("does not take away another plugin's binding on the second enable", () => {
		const editor = makeEditor("hello");
		const first = ledgerFor(editor);
		first.ledger.apply(vimApi, first.dispatcher, [], UNMAPS);

		// Another plugin binds S while ours is off...
		vimApi.noremap("S", "x", "normal");
		// ...and ours is switched back on, with a ledger that starts empty.
		const second = ledgerFor(editor);
		second.ledger.apply(vimApi, second.dispatcher, [], UNMAPS);
		press(editor.cm, "S");

		expect(editor.view.state.doc.toString()).toBe("ello");
		vimApi.unmap("S", "normal");
	});

	it("does not look for a mode-less binding a second time either", () => {
		const editor = makeEditor("hello");
		const unmaps = [{ keys: "<Space>", contexts: ["normal" as const] }];
		const first = ledgerFor(editor);
		first.ledger.apply(vimApi, first.dispatcher, [], unmaps);

		vimApi.noremap("<Space>", "x");
		const second = ledgerFor(editor);
		second.ledger.apply(vimApi, second.dispatcher, [], unmaps);
		press(editor.cm, "<Space>");

		expect(editor.view.state.doc.toString()).toBe("ello");
		vimApi.unmap("<Space>");
	});
});
