import { describe, expect, it } from "vitest";

import { VimDispatcher } from "../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../src/core/keymap";
import { ActionRegistry } from "../../src/core/registry";
import type { BindingContext, VimActionDef, VimApi } from "../../src/types";

interface KeymapEntry {
	keys: string;
	context?: string;
	name?: string;
}

/**
 * Models the parts of CodeMirror's vim that the ledger depends on, with the
 * same semantics as the real implementation: `_mapCommand` unshifts onto
 * `defaultKeymap`, and `unmap` splices out the *first* entry matching both keys
 * and context. Together those mean the most recently mapped binding is the one
 * removed, which is what makes per-binding teardown possible at all.
 */
function fakeVim() {
	const defaultKeymap: KeymapEntry[] = [];
	const defined: string[] = [];
	const vim = {
		defaultKeymap,
		defined,
		mapCommand(
			keys: string,
			_kind: string,
			name: string,
			_args: unknown,
			extra: { context?: string },
		) {
			defaultKeymap.unshift({ keys, context: extra?.context, name });
		},
		unmap(keys: string, context?: string) {
			for (let i = 0; i < defaultKeymap.length; i++) {
				if (defaultKeymap[i]?.keys === keys && defaultKeymap[i]?.context === context) {
					defaultKeymap.splice(i, 1);
					return true;
				}
			}
			return false;
		},
		defineAction(name: string) {
			defined.push(name);
		},
		defineMotion(name: string) {
			defined.push(name);
		},
		defineOperator(name: string) {
			defined.push(name);
		},
	};
	return vim as unknown as VimApi & typeof vim;
}

function action(
	id: string,
	keys?: string,
	contexts: BindingContext[] = ["normal"],
): VimActionDef {
	return {
		id,
		name: id,
		group: "Test",
		kind: "action",
		defaultKeys: keys ? [{ keys, contexts }] : undefined,
		run: () => {},
	};
}

let sourceCounter = 0;

/** Contributes actions as a fresh source, so each call is independent. */
function give(registry: ActionRegistry, ...defs: VimActionDef[]): void {
	registry.set(`module:test-${++sourceCounter}`, { actions: defs });
}

function setup() {
	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher({} as never, registry, () => null, () => null);
	return { registry, dispatcher, vim: fakeVim(), ledger: new MappingLedger() };
}

describe("resolveBindings", () => {
	it("flattens default keys across contexts", () => {
		const registry = new ActionRegistry();
		give(registry, action("a", "gx", ["normal", "visual"]));

		const { bindings } = resolveBindings(registry);

		expect(bindings).toHaveLength(2);
		expect(bindings.map((b) => b.context).sort()).toEqual(["normal", "visual"]);
	});

	it("reports a conflict and lets the last registration win", () => {
		const registry = new ActionRegistry();
		give(registry, action("first", "gx"));
		give(registry, action("second", "gx"));

		const { bindings, conflicts } = resolveBindings(registry);

		expect(bindings).toHaveLength(1);
		expect(bindings[0]?.target).toMatchObject({ kind: "action", id: "second" });
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.claimants).toEqual(["action:first", "action:second"]);
		expect(conflicts[0]?.winner).toBe("action:second");
	});

	it("mirrors a normal-mode motion into operatorPending so operators see it", () => {
		// CodeMirror rewrites the context to "operatorPending" while an
		// operator waits, then skips commands whose context differs — so a
		// motion mapped only as "normal" silently does nothing after `d`.
		const registry = new ActionRegistry();
		give(registry, {
			id: "m",
			name: "m",
			group: "Test",
			kind: "motion",
			defaultKeys: [{ keys: "gz", contexts: ["normal"] }],
			run: () => undefined,
		});

		const contexts = resolveBindings(registry).bindings.map((b) => b.context);

		expect(contexts.sort()).toEqual(["normal", "operatorPending"]);
	});

	it("does not mirror actions or visual-mode motions", () => {
		const registry = new ActionRegistry();
		give(registry, action("a", "gx", ["normal"]));
		give(registry, {
			id: "m",
			name: "m",
			group: "Test",
			kind: "motion",
			defaultKeys: [{ keys: "gy", contexts: ["visual"] }],
			run: () => undefined,
		});

		const contexts = resolveBindings(registry).bindings.map((b) => b.context);

		expect(contexts).not.toContain("operatorPending");
	});

	it("does not flag the same key in different contexts as a conflict", () => {
		const registry = new ActionRegistry();
		give(registry, action("a", "gx", ["normal"]));
		give(registry, action("b", "gx", ["visual"]));

		expect(resolveBindings(registry).conflicts).toHaveLength(0);
	});
});

describe("MappingLedger", () => {
	it("maps every resolved binding", () => {
		const { registry, dispatcher, vim, ledger } = setup();
		give(registry, action("a", "gx"));
		give(registry, action("b", "gy"));

		ledger.apply(vim, dispatcher, resolveBindings(registry).bindings);

		expect(vim.defaultKeymap).toHaveLength(2);
		expect(ledger.size).toBe(2);
	});

	it("unmaps exactly what it mapped, leaving pre-existing bindings alone", () => {
		const { registry, dispatcher, vim, ledger } = setup();
		// Something else — core vim, or another plugin — already owns `gx`.
		vim.defaultKeymap.push({ keys: "gx", context: "normal", name: "somebodyElse" });
		give(registry, action("a", "gx"));

		ledger.apply(vim, dispatcher, resolveBindings(registry).bindings);
		expect(vim.defaultKeymap).toHaveLength(2);

		ledger.clear(vim);

		expect(vim.defaultKeymap).toHaveLength(1);
		expect(vim.defaultKeymap[0]?.name).toBe("somebodyElse");
		expect(ledger.size).toBe(0);
	});

	it("replaces rather than duplicates when applied twice", () => {
		const { registry, dispatcher, vim, ledger } = setup();
		give(registry, action("a", "gx"));
		const { bindings } = resolveBindings(registry);

		ledger.apply(vim, dispatcher, bindings);
		ledger.apply(vim, dispatcher, bindings);

		expect(vim.defaultKeymap).toHaveLength(1);
		expect(ledger.size).toBe(1);
	});

	it("defines each vim-side stub only once across reloads", () => {
		const { registry, dispatcher, vim, ledger } = setup();
		give(registry, action("a", "gx"));
		const { bindings } = resolveBindings(registry);

		ledger.apply(vim, dispatcher, bindings);
		ledger.apply(vim, dispatcher, bindings);

		expect(vim.defined).toEqual(["vimTools_a"]);
	});

	it("leaves the keymap empty after teardown", () => {
		const { registry, dispatcher, vim, ledger } = setup();
		give(registry, action("a", "gx", ["normal", "visual"]));
		give(registry, action("b", "gy"));

		ledger.apply(vim, dispatcher, resolveBindings(registry).bindings);
		ledger.clear(vim);

		expect(vim.defaultKeymap).toEqual([]);
	});
});
