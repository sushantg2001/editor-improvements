import { afterEach, describe, expect, it, vi } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, press, vimApi } from "../../helpers/vim";
import type { VimActionDef } from "../../../src/types";

afterEach(() => {
	// defaultKeymap is a module singleton shared by every editor.
	vimApi.mapclear();
});

function harness(doc = "alpha\nbravo\ncharlie") {
	const editor = makeEditor(doc);
	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	return { ...editor, registry, dispatcher, ledger: new MappingLedger() };
}

function action(id: string, keys: string, extra: Partial<VimActionDef> = {}): VimActionDef {
	return {
		id,
		name: id,
		group: "Test",
		kind: "action",
		defaultKeys: [{ keys, contexts: ["normal"] }],
		run: () => {},
		...extra,
	};
}

/** A motion bound to `keys` that jumps to the start of `line`. */
function motionTo(id: string, keys: string, line: number): VimActionDef {
	return {
		id,
		name: id,
		group: "Test",
		kind: "motion",
		defaultKeys: [{ keys, contexts: ["normal"] }],
		run: () => ({ line, ch: 0 }),
	};
}

describe("MappingLedger against the real Vim API", () => {
	it("binds a key that then actually fires the action", () => {
		const { registry, dispatcher, ledger, cm } = harness();
		const run = vi.fn();
		registry.set("test", { actions: [action("a", "gz", { run })] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "g", "z");

		expect(run).toHaveBeenCalledOnce();
	});

	it("unbinds it again on clear — the claim the whole teardown rests on", () => {
		// `mapCommand` has no removal API. This asserts empirically what the
		// ledger infers: `unmap(keys, context)` does remove a mapCommand entry.
		const { registry, dispatcher, ledger, cm } = harness();
		const run = vi.fn();
		registry.set("test", { actions: [action("a", "gz", { run })] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "g", "z");
		expect(run).toHaveBeenCalledOnce();

		ledger.clear(vimApi);
		run.mockClear();
		press(cm, "g", "z");

		expect(run).not.toHaveBeenCalled();
	});

	it("leaves a mapping made by someone else intact", () => {
		const { registry, dispatcher, ledger, cm, view } = harness("alpha\nbravo");
		// Another plugin (or the user's config) owns `gm`.
		vimApi.map("gm", "dd", "normal");
		registry.set("test", { actions: [action("a", "gz")] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		ledger.clear(vimApi);

		press(cm, "g", "m");
		expect(view.state.doc.toString()).toBe("bravo");
	});

	it("does not fire in a context it was not bound to", () => {
		const { registry, dispatcher, ledger, cm } = harness();
		const run = vi.fn();
		registry.set("test", { actions: [action("a", "gz", { run })] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "v"); // visual mode
		press(cm, "g", "z");

		expect(run).not.toHaveBeenCalled();
	});

	it("re-applying does not double-fire", () => {
		const { registry, dispatcher, ledger, cm } = harness();
		const run = vi.fn();
		registry.set("test", { actions: [action("a", "gz", { run })] });
		const { bindings } = resolveBindings(registry);

		ledger.apply(vimApi, dispatcher, bindings);
		ledger.apply(vimApi, dispatcher, bindings);
		press(cm, "g", "z");

		expect(run).toHaveBeenCalledOnce();
	});

	it("hot-swaps an action body without remapping the key", () => {
		// The point of permanent dispatch stubs: reloading a script replaces
		// the registry entry while the vim-side binding stays put.
		const { registry, dispatcher, ledger, cm } = harness();
		const first = vi.fn();
		const second = vi.fn();
		registry.set("script:init.js", { actions: [action("a", "gz", { run: first })] });
		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);

		registry.set("script:init.js", { actions: [action("a", "gz", { run: second })] });
		press(cm, "g", "z");

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
	});

	it("becomes an inert no-op when the action is removed but the key remains", () => {
		const { registry, dispatcher, ledger, cm } = harness();
		registry.set("script:init.js", { actions: [action("a", "gz")] });
		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);

		registry.remove("script:init.js");

		expect(() => press(cm, "g", "z")).not.toThrow();
	});

	it("passes a count through to the action as repeat", () => {
		const { registry, dispatcher, ledger, cm } = harness();
		const run = vi.fn();
		registry.set("test", { actions: [action("a", "gz", { run })] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "3", "g", "z");

		expect(run).toHaveBeenCalledOnce();
		expect(run.mock.calls[0]?.[1]).toMatchObject({ repeat: 3 });
	});
});

describe("motions against the real Vim API", () => {
	it("moves the cursor to the position a motion returns", () => {
		const { registry, dispatcher, ledger, cm, view } = harness("alpha\nbravo\ncharlie");
		registry.set("test", { actions: [motionTo("toLastLine", "gz", 2)] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "g", "z");

		expect(view.state.selection.main.head).toBe(
			view.state.doc.line(3).from,
		);
	});

	it("stops composing with operators once the ledger is cleared", () => {
		// The derived operatorPending binding has to be torn down too, or it
		// outlives the plugin.
		const { registry, dispatcher, ledger, cm, view } = harness("alpha\nbravo\ncharlie");
		registry.set("test", { actions: [motionTo("toLastLine", "gz", 2)] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		ledger.clear(vimApi);
		press(cm, "d", "g", "z");

		expect(view.state.doc.toString()).toBe("alpha\nbravo\ncharlie");
	});

	it("composes with an operator, which a plain command could never do", () => {
		// This is the reason hop/flash are motions rather than Obsidian
		// commands: `d` + motion has to work.
		const { registry, dispatcher, ledger, cm, view } = harness("alpha\nbravo\ncharlie");
		registry.set("test", { actions: [motionTo("toLastLine", "gz", 2)] });

		ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		press(cm, "d", "g", "z");

		expect(view.state.doc.toString()).not.toContain("alpha");
	});
});
