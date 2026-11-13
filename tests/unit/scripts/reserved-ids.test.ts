import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

function setup(files: Record<string, string>) {
	const app = new App();
	const registry = new ActionRegistry();
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	app.vault.adapter.dirs.add(FOLDER);
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { host, registry };
}

describe("ScriptHost with an action named like a plugin command", () => {
	it("refuses it, so the script cannot replace Reload configuration", async () => {
		const { host, registry } = setup({ "init.js": `vim.action("reload-config", () => {});` });

		const result = await host.reload();

		expect(result.loaded).toEqual([]);
		expect(result.errors[0]?.message).toMatch(/reload-config/);
		expect(registry.has("reload-config")).toBe(false);
	});

	it("accepts it when it is kept out of the command palette", async () => {
		const { host, registry } = setup({
			"init.js": `vim.action("reload-config", () => {}, { command: false });`,
		});

		await host.reload();

		expect(registry.has("reload-config")).toBe(true);
	});
});
