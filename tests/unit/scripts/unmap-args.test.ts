import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = "scripts";

async function load(code: string) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, code);
	const registry = new ActionRegistry();
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { registry, error: (await host.reload()).errors[0]?.message };
}

describe("vim.unmap with the wrong kind of argument", () => {
	it.each([
		["a string for the contexts", 'vim.unmap("x", "normal");'],
		["an empty list of contexts", 'vim.unmap("x", []);'],
		["null for the contexts", 'vim.unmap("x", null);'],
	])("refuses %s, which would free nothing", async (_what, code) => {
		const { registry, error } = await load(code);

		expect(error).toContain('unmap "x": contexts is a non-empty list');
		expect(registry.unmaps()).toEqual([]);
	});

	it("refuses an unknown context", async () => {
		const { error } = await load('vim.unmap("x", ["normal", "command"]);');

		expect(error).toContain('unknown context "command"');
	});

	it.each(["vim.unmap();", "vim.nunmap();", "vim.nunmap(5);", "vim.vunmap(null);"])(
		"says what it needs when the key is missing or not a string: %s",
		async (code) => {
			const { error } = await load(code);

			expect(error).toMatch(/vim\.unmap needs the key to free, as a string/);
		},
	);

	it("still takes a list of contexts, or none", async () => {
		const { registry, error } = await load('vim.unmap("x", ["normal"]); vim.nunmap("y"); vim.unmap("z");');

		expect(error).toBeUndefined();
		expect(registry.unmaps().map((u) => u.keys)).toEqual(["x", "y", "z"]);
	});
});
