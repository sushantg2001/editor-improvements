import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, press, vimApi } from "../../helpers/vim";

/**
 * Removing a built-in binding cannot be undone, and vim's keymap is shared by
 * every editor in the process. The tests below therefore run in order: the one
 * that needs the built-in `S` goes first, and the rest may remove it.
 */

afterEach(() => {
	vimApi.mapclear();
});

function harness(doc: string) {
	const editor = makeEditor(doc);
	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	return { ...editor, registry, dispatcher, ledger: new MappingLedger() };
}

const surroundL = {
	bindings: [
		{ keys: "Sl", contexts: ["normal" as const], target: { kind: "keys" as const, rhs: "x", recursive: false } },
	],
};

describe("MappingLedger unmaps against the real Vim API", () => {
	it("starts with the built-in S, which fires at once and hides Sl", () => {
		const { registry, dispatcher, ledger, cm, view } = harness("hello world");
		registry.set("test", surroundL);

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "S");

		expect(view.state.doc.toString()).toBe("");
	});

	it("frees the key, so the longer mapping can be reached", () => {
		const { registry, dispatcher, ledger, cm, view } = harness("hello world");
		registry.set("test", surroundL);

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings, [
			{ keys: "S", contexts: ["normal"] },
		]);
		press(cm, "S", "l");

		expect(view.state.doc.toString()).toBe("ello world");
	});

	it("removes a built-in only once, so a rebuild cannot take somebody else's mapping", () => {
		const { dispatcher, ledger, cm, view } = harness("hello");
		const unmaps = [{ keys: "S", contexts: ["normal" as const] }];

		ledger.apply(vimApi, dispatcher, [], unmaps);
		vimApi.noremap("S", "x", "normal"); // another plugin's mapping, added in between
		ledger.apply(vimApi, dispatcher, [], unmaps);
		press(cm, "S");

		expect(view.state.doc.toString()).toBe("ello");
		vimApi.unmap("S", "normal");
	});

	it("does nothing for an empty list", () => {
		const { dispatcher, ledger, cm, view } = harness("hello");
		vimApi.noremap("S", "x", "normal");

		ledger.apply(vimApi, dispatcher, [], []);
		press(cm, "S");

		expect(view.state.doc.toString()).toBe("ello");
		vimApi.unmap("S", "normal");
	});

	it("frees a built-in that has no mode of its own, which asking for one mode never finds", () => {
		// <Space> is one entry for every mode. Vim matches the mode exactly, so
		// unmapping it "in normal mode" removed nothing, and <Space>d stayed
		// hidden behind it.
		const { registry, dispatcher, ledger, cm, view } = harness("hello");
		registry.set("test", {
			bindings: [
				{
					keys: "<Space>d",
					contexts: ["normal"],
					target: { kind: "keys", rhs: "x", recursive: false },
				},
			],
		});

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings, [
			{ keys: "<Space>", contexts: ["normal"] },
		]);
		press(cm, "<Space>", "d");

		expect(view.state.doc.toString()).toBe("ello");
	});
});
