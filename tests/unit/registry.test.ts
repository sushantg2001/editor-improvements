import { describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "../../src/core/registry";
import type { VimActionDef } from "../../src/types";

function action(id: string, extra: Partial<VimActionDef> = {}): VimActionDef {
	return {
		id,
		name: id,
		group: "Test",
		kind: "action",
		run: () => {},
		...extra,
	};
}

describe("ActionRegistry contributions", () => {
	it("exposes the actions a source contributed", () => {
		const registry = new ActionRegistry();
		registry.set("builtin", { actions: [action("a"), action("b")] });

		expect(registry.actions().map((d) => d.id)).toEqual(["a", "b"]);
		expect(registry.has("a")).toBe(true);
		expect(registry.sourceOf("b")).toBe("builtin");
	});

	it("replaces a source wholesale, which is what makes reload correct", () => {
		// The previous model needed a separate teardown step; forgetting it
		// left stale actions behind. Replacing the contribution cannot.
		const registry = new ActionRegistry();
		registry.set("script:init.js", { actions: [action("first")] });
		registry.set("script:init.js", { actions: [action("second")] });

		expect(registry.actions().map((d) => d.id)).toEqual(["second"]);
	});

	it("removes everything a source contributed", () => {
		const registry = new ActionRegistry();
		registry.set("builtin", { actions: [action("keep")] });
		registry.set("script:a.js", {
			actions: [action("drop1"), action("drop2")],
			bindings: [
				{ keys: "gx", contexts: ["normal"], target: { kind: "action", id: "drop1", actionKind: "action" } },
			],
		});

		expect(registry.remove("script:a.js")).toBe(true);

		expect(registry.actions().map((d) => d.id)).toEqual(["keep"]);
		expect(registry.bindings()).toEqual([]);
	});

	it("lets a later source shadow an earlier one by id", () => {
		const registry = new ActionRegistry();
		const builtin = vi.fn();
		const override = vi.fn();
		registry.set("builtin", { actions: [action("a", { run: builtin })] });
		registry.set("script:init.js", { actions: [action("a", { run: override })] });

		expect(registry.actions()).toHaveLength(1);
		expect(registry.sourceOf("a")).toBe("script:init.js");
		void registry.get("a")?.run({} as never, { repeat: 1 });
		expect(builtin).not.toHaveBeenCalled();
		expect(override).toHaveBeenCalledOnce();
	});

	it("keeps source order stable across a replacement", () => {
		// "Later wins" is only meaningful if order does not shuffle when a
		// script is edited and re-set.
		const registry = new ActionRegistry();
		registry.set("builtin", { actions: [action("a", { name: "builtin" })] });
		registry.set("script:z.js", { actions: [action("a", { name: "script" })] });
		registry.set("builtin", { actions: [action("a", { name: "builtin-v2" })] });

		expect(registry.get("a")?.name).toBe("script");
	});
});

describe("ActionRegistry bindings", () => {
	it("folds an action's defaultKeys into the binding list", () => {
		const registry = new ActionRegistry();
		registry.set("builtin", {
			actions: [action("a", { defaultKeys: [{ keys: "gx", contexts: ["normal"] }] })],
		});

		expect(registry.bindings()).toEqual([
			{
				keys: "gx",
				contexts: ["normal"],
				target: { kind: "action", id: "a", actionKind: "action" },
				source: "builtin",
			},
		]);
	});

	it("returns explicit bindings alongside derived ones, in source order", () => {
		const registry = new ActionRegistry();
		registry.set("builtin", {
			actions: [action("a", { defaultKeys: [{ keys: "gx", contexts: ["normal"] }] })],
		});
		registry.set("script:init.js", {
			bindings: [
				{ keys: "H", contexts: ["normal"], target: { kind: "keys", rhs: "^", recursive: false } },
			],
		});

		expect(registry.bindings().map((b) => b.keys)).toEqual(["gx", "H"]);
		expect(registry.bindings().map((b) => b.source)).toEqual([
			"builtin",
			"script:init.js",
		]);
	});

	it("has no bindings when nothing declares any", () => {
		const registry = new ActionRegistry();
		registry.set("builtin", { actions: [action("a")] });

		expect(registry.bindings()).toEqual([]);
	});
});

describe("ActionRegistry notifications", () => {
	it("notifies on set and on remove", () => {
		const registry = new ActionRegistry();
		const listener = vi.fn();
		registry.onChange(listener);

		registry.set("builtin", { actions: [action("a")] });
		registry.remove("builtin");

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("does not notify when removing a source that was never there", () => {
		const registry = new ActionRegistry();
		const listener = vi.fn();
		registry.onChange(listener);

		expect(registry.remove("nope")).toBe(false);
		expect(listener).not.toHaveBeenCalled();
	});

	it("coalesces a batch into one notification", () => {
		// Otherwise every surface re-syncs once per script during a reload, and
		// conflict notices fire against half-built intermediate states.
		const registry = new ActionRegistry();
		const listener = vi.fn();
		registry.onChange(listener);

		registry.batch(() => {
			registry.set("a", { actions: [action("a")] });
			registry.set("b", { actions: [action("b")] });
			registry.remove("a");
		});

		expect(listener).toHaveBeenCalledTimes(1);
		expect(registry.actions().map((d) => d.id)).toEqual(["b"]);
	});

	it("does not notify for a batch that changed nothing", () => {
		const registry = new ActionRegistry();
		const listener = vi.fn();
		registry.onChange(listener);

		registry.batch(() => {});

		expect(listener).not.toHaveBeenCalled();
	});

	it("survives a listener unsubscribing while being notified", () => {
		const registry = new ActionRegistry();
		const second = vi.fn();
		const stop = registry.onChange(() => stop());
		registry.onChange(second);

		expect(() => registry.set("a", { actions: [action("a")] })).not.toThrow();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("stops notifying an unsubscribed listener", () => {
		const registry = new ActionRegistry();
		const listener = vi.fn();
		const stop = registry.onChange(listener);

		stop();
		registry.set("a", { actions: [action("a")] });

		expect(listener).not.toHaveBeenCalled();
	});
});
