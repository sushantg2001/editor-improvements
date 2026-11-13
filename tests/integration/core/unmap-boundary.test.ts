import { describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, press, vimApi } from "../../helpers/vim";

/**
 * A plain remap (`nnoremap`) is resolved by the addon against its built-in keys
 * only, found by counting back from the end of the keymap by the number of
 * built-ins it began with. Removing built-ins throws that count off. This file
 * removes several and then uses plain remaps; it avoids mapclear, which
 * relies on the same count.
 */

describe("plain remaps after built-ins have been removed", () => {
	it("still work when more built-ins are removed than mappings exist", () => {
		const editor = makeEditor("hello world");
		const registry = new ActionRegistry();
		registry.set("script:init.js", {
			bindings: [
				{ keys: "Q", contexts: ["normal"], target: { kind: "keys", rhs: "x", recursive: false } },
			],
		});
		const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);

		new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings, [
			{ keys: "S", contexts: ["normal", "visual"] },
			{ keys: "gJ", contexts: ["normal"] },
			{ keys: "<Space>" },
			{ keys: ",", contexts: ["normal"] },
		]);

		// Without the compensation this throws "undefined is not an object
		// (evaluating 'command.context')" from inside the addon.
		expect(() => press(editor.cm, "Q")).not.toThrow();
		expect(editor.view.state.doc.toString()).toBe("ello world");
	});

	it("keep resolving their right-hand side to the built-in key", () => {
		const editor = makeEditor("hello world");
		const registry = new ActionRegistry();
		registry.set("script:init.js", {
			bindings: [
				// x is remapped by the user; a plain remap of Z to x must still mean the built-in x.
				{ keys: "x", contexts: ["normal"], target: { kind: "keys", rhs: "dd", recursive: false } },
				{ keys: "Z", contexts: ["normal"], target: { kind: "keys", rhs: "x", recursive: false } },
			],
		});
		const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
		new MappingLedger().apply(vimApi, dispatcher, resolveBindings(registry).bindings, [
			{ keys: "gU", contexts: ["normal"] },
		]);

		press(editor.cm, "Z");

		expect(editor.view.state.doc.toString()).toBe("ello world");
	});
});
