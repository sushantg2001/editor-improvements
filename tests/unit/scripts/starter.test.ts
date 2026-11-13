import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { scaffoldScripts } from "../../../src/scripts/scaffold";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

/** Creates the scripts folder the way the command does, then loads what it wrote. */
async function loadStarter() {
	const app = new App();
	await scaffoldScripts(app as never, FOLDER);
	const registry = new ActionRegistry();
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const result = await host.reload();
	return { registry, result };
}

describe("the starter init.js", () => {
	it("runs without an error, so a new user starts from something that works", async () => {
		const { result } = await loadStarter();

		expect(result.errors).toEqual([]);
		expect(result.loaded).toEqual(["init.js"]);
	});

	it("frees <Space> before using it as the leader", async () => {
		const { registry } = await loadStarter();

		expect(registry.unmaps()).toEqual([{ keys: "<Space>", contexts: ["normal"] }]);
	});

	it("maps jk, H and L as plain remaps", async () => {
		const { registry } = await loadStarter();
		const keys = registry
			.bindings()
			.filter((binding) => binding.target.kind === "keys")
			.map((binding) => [binding.keys, binding.contexts, binding.target.kind === "keys" ? binding.target.rhs : ""]);

		expect(keys).toEqual([
			["jk", ["insert"], "<Esc>"],
			["H", ["normal"], "^"],
			["L", ["normal"], "$"],
		]);
	});

	it("defines a command that works with no editor open and a motion that needs one", async () => {
		const { registry } = await loadStarter();

		expect(registry.get("openToday")).toMatchObject({ kind: "action", needsEditor: false });
		expect(registry.get("toLastLine")).toMatchObject({ kind: "motion" });
		expect(registry.get("toLastLine")?.needsEditor).not.toBe(false);
	});

	it("opens today's note from <leader>d, with the leader the script sets", async () => {
		const { registry } = await loadStarter();

		const binding = registry.bindings().find((b) => b.target.kind === "action" && b.target.id === "openToday");
		expect(binding?.keys).toBe("<Space>d");
	});
});
