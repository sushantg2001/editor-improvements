import { describe, expect, it, vi } from "vitest";

import { ModuleHost, moduleSource } from "../../../src/core/modules";
import { ActionRegistry } from "../../../src/core/registry";
import { Component } from "../../mocks/obsidian";
import type { FeatureModule, ModuleContext } from "../../../src/core/modules";
import type { VimActionDef } from "../../../src/types";

const ctx = { app: {}, getVim: () => null } as unknown as ModuleContext;

function action(id: string): VimActionDef {
	return { id, name: id, group: "Test", kind: "action", run: () => {} };
}

function module(id: string, ids: string[] = [], extra: Partial<FeatureModule> = {}): FeatureModule {
	return {
		id,
		title: id,
		create: () => ({ contribution: { actions: ids.map(action) } }),
		...extra,
	};
}

function start(modules: FeatureModule[], onError?: (m: FeatureModule, e: unknown) => void) {
	const registry = new ActionRegistry();
	const host = new ModuleHost({ registry, modules, context: ctx, onError });
	host.load();
	return { registry, host };
}

describe("ModuleHost", () => {
	it("registers each module under module:<id>", () => {
		const { registry } = start([module("alpha", ["a1"]), module("beta", ["b1"])]);

		expect(registry.sourceOf("a1")).toBe("module:alpha");
		expect(registry.sourceOf("b1")).toBe("module:beta");
		expect(moduleSource("alpha")).toBe("module:alpha");
	});

	it("applies every module in one change notification", () => {
		const registry = new ActionRegistry();
		const listener = vi.fn();
		registry.onChange(listener);

		new ModuleHost({
			registry,
			modules: [module("a", ["x"]), module("b", ["y"]), module("c", ["z"])],
			context: ctx,
		}).load();

		expect(listener).toHaveBeenCalledOnce();
	});

	it("keeps declaration order, so a later module shadows an earlier one", () => {
		const { registry } = start([module("first", ["same"]), module("second", ["same"])]);

		expect(registry.sourceOf("same")).toBe("module:second");
	});

	it("removes everything on unload", () => {
		const { registry, host } = start([module("alpha", ["a1"])]);

		host.unload();

		expect(registry.actions()).toEqual([]);
	});

	it("loads a module's component as a child and unloads it with the host", () => {
		const component = new Component();
		const { host } = start([module("watcher", [], { create: () => ({ component: component as never }) })]);

		expect(component.loaded).toBe(true);
		host.unload();
		expect(component.loaded).toBe(false);
	});

	it("lets a module contribute nothing", () => {
		const { registry, host } = start([module("empty", [], { create: () => ({}) })]);

		expect(registry.actions()).toEqual([]);
		expect(host.active).toEqual(["empty"]);
	});

	it("isolates a module that throws, and reports it", () => {
		const onError = vi.fn();
		const broken = module("broken", [], {
			create: () => {
				throw new Error("boom");
			},
		});

		const { registry, host } = start([module("ok", ["fine"]), broken, module("after", ["later"])], onError);

		expect(registry.has("fine")).toBe(true);
		expect(registry.has("later")).toBe(true);
		expect(host.active).toEqual(["ok", "after"]);
		expect(onError).toHaveBeenCalledWith(broken, expect.any(Error));
	});
});
