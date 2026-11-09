import { describe, expect, it } from "vitest";

import { resolveBindings } from "../../../src/core/keymap";
import { ModuleHost, moduleSource } from "../../../src/core/modules";
import { ActionRegistry } from "../../../src/core/registry";
import { validateContribution } from "../../../src/core/validate";
import { DEFAULT_SETTINGS, RESERVED_COMMAND_IDS } from "../../../src/constants";
import { MODULES } from "../../../src/modules";
import { App } from "../../mocks/obsidian";
import type { ModuleContext } from "../../../src/core/modules";

/**
 * The contract every feature module must keep.
 *
 * It runs over `MODULES`, so a new module is checked the moment it is listed
 * there. A failure names the module and the rule, which is the point: the
 * rules are what keep forty-odd actions from several authors consistent.
 */

const ctx = { app: new App(), getVim: () => null, settings: () => DEFAULT_SETTINGS } as unknown as ModuleContext;

const instances = MODULES.map((module) => ({
	module,
	instance: module.create(ctx),
}));

describe("feature module contract", () => {
	it("lists at least one module", () => {
		expect(MODULES.length).toBeGreaterThan(0);
	});

	it("gives every module a unique kebab-case id and a title", () => {
		const ids = MODULES.map((m) => m.id);

		expect(new Set(ids).size).toBe(ids.length);
		for (const module of MODULES) {
			expect(module.id, `module id "${module.id}"`).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
			expect(module.title.trim(), `title of ${module.id}`).not.toBe("");
		}
	});

	it.each(instances.map(({ module, instance }) => [module.id, instance] as const))(
		"%s: creates without an editor or the Vim API",
		(_id, instance) => {
			// create() already ran above with getVim() === null; reaching here
			// means it neither threw nor needed either.
			expect(instance).toBeTypeOf("object");
		},
	);

	it.each(instances.map(({ module, instance }) => [module.id, instance] as const))(
		"%s: contributes only valid actions and bindings",
		(_id, instance) => {
			expect(validateContribution(instance.contribution ?? {})).toEqual([]);
		},
	);

	it("labels every group with a capitalised name, so the palette reads consistently", () => {
		for (const { module, instance } of instances) {
			for (const action of instance.contribution?.actions ?? []) {
				expect(action.group, `${action.id} in ${module.id}`).toMatch(/^[A-Z][A-Za-z0-9 ]*$/);
			}
		}
	});

	it("never reuses an action id across modules", () => {
		const owner = new Map<string, string>();
		for (const { module, instance } of instances) {
			for (const action of instance.contribution?.actions ?? []) {
				const previous = owner.get(action.id);
				expect(previous, `"${action.id}" is in both ${previous} and ${module.id}`).toBeUndefined();
				owner.set(action.id, module.id);
			}
		}
	});

	it("never takes a command id the plugin itself uses", () => {
		for (const { instance } of instances) {
			for (const action of instance.contribution?.actions ?? []) {
				if (action.command !== false) {
					expect(RESERVED_COMMAND_IDS).not.toContain(action.id);
				}
			}
		}
	});

	it("gives motions and operators an editor, since they act on a position", () => {
		for (const { instance } of instances) {
			for (const action of instance.contribution?.actions ?? []) {
				if (action.kind !== "action") {
					expect(action.needsEditor, `${action.id} is a ${action.kind}`).not.toBe(false);
				}
			}
		}
	});

	it("declares default keys that never fight each other", () => {
		const registry = new ActionRegistry();
		new ModuleHost({ registry, modules: MODULES, context: ctx }).load();

		expect(resolveBindings(registry).conflicts).toEqual([]);
	});

	it("registers every module under its own source", () => {
		const registry = new ActionRegistry();
		const host = new ModuleHost({ registry, modules: MODULES, context: ctx });
		host.load();

		expect(host.active).toEqual(MODULES.map((m) => m.id));
		for (const { module, instance } of instances) {
			for (const action of instance.contribution?.actions ?? []) {
				expect(registry.sourceOf(action.id)).toBe(moduleSource(module.id));
			}
		}
	});
});
