import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

async function load(files: Record<string, string>) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	const registry = new ActionRegistry();
	registry.set("module:test", {
		actions: [{ id: "builtIn", name: "Built in", group: "Test", kind: "action", run: () => undefined }],
	});
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

const bound = (registry: ActionRegistry) => registry.bindings().map((binding) => binding.keys);

describe("vim.bind to an action that does not exist", () => {
	it("reports the typo and does not take the key", async () => {
		const { registry, result } = await load({
			"init.js": `vim.action("real", () => {}); vim.bind("gx", "reall"); vim.bind("gy", "real");`,
		});

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ file: "init.js" });
		expect(result.errors[0]?.message).toContain('"gx"');
		expect(result.errors[0]?.message).toContain('"reall"');
		expect(bound(registry)).toEqual(["gy"]);
	});

	it("accepts an action a later script defines", async () => {
		const { registry, result } = await load({
			"init.js": `vim.bind("gx", "later");`,
			"more.js": `vim.action("later", () => {});`,
		});

		expect(result.errors).toEqual([]);
		expect(bound(registry)).toEqual(["gx"]);
	});

	it("accepts an action of the plugin itself", async () => {
		const { registry, result } = await load({ "init.js": `vim.bind("gx", "builtIn");` });

		expect(result.errors).toEqual([]);
		expect(bound(registry)).toEqual(["gx"]);
	});

	it("does not mistake an action a script used to define for one that exists", async () => {
		const first = await load({ "init.js": `vim.action("gone", () => {});` });
		// Same registry, the script rewritten without the action but still binding it.
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.action("gone", () => {});`);
		const host = new ScriptHost({
			app: app as never,
			registry: first.registry,
			getVim: () => null,
			isEnabled: () => true,
			getFolder: () => FOLDER,
			getLeader: () => "\\",
		});
		await host.reload();
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.bind("gx", "gone");`);

		const result = await host.reload();

		expect(result.errors[0]?.message).toContain('"gone"');
		expect(bound(first.registry)).toEqual([]);
	});

	it("leaves a plain remap to a key sequence alone", async () => {
		const { registry, result } = await load({ "init.js": `vim.nnoremap("H", "^");` });

		expect(result.errors).toEqual([]);
		expect(bound(registry)).toEqual(["H"]);
	});
});
