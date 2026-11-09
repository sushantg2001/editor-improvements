import { beforeEach, describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

function setup(files: Record<string, string>, enabled = true) {
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
		isEnabled: () => enabled,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { host, registry, app };
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("ScriptHost.reload", () => {
	it("does nothing when scripts are disabled", async () => {
		const { host, registry } = setup({ "init.js": `vim.action("a", () => {});` }, false);

		const result = await host.reload();

		expect(result.loaded).toEqual([]);
		expect(registry.actions()).toHaveLength(0);
	});

	it("runs init.js and registers what it defines", async () => {
		const { host, registry } = setup({
			"init.js": `vim.action("a", () => {}); vim.nmap("gz", "a");`,
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(registry.get("a")).toBeTruthy();
		expect(registry.bindings()).toHaveLength(1);
	});

	it("runs init.js first, then the rest in lexical order", async () => {
		const { host } = setup({
			"zebra.js": "",
			"alpha.js": "",
			"init.js": "",
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js", "alpha.js", "zebra.js"]);
	});

	it("ignores files that are not .js", async () => {
		const { host } = setup({ "init.js": "", "notes.md": "hello", "a.ts": "" });

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
	});

	it("copes with a folder that does not exist", async () => {
		const { host, app } = setup({});
		app.vault.adapter.dirs.clear();

		await expect(host.reload()).resolves.toMatchObject({ loaded: [], errors: [] });
	});

	it("supports await inside a script", async () => {
		const { host, registry } = setup({
			"init.js": `await Promise.resolve(); vim.action("a", () => {});`,
		});

		await host.reload();

		expect(registry.get("a")).toBeTruthy();
	});
});

describe("ScriptHost error handling", () => {
	it("reports the failing file and keeps the others", async () => {
		const { host, registry } = setup({
			"init.js": `vim.action("good", () => {});`,
			"zbroken.js": `this is not javascript(`,
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.file).toBe("zbroken.js");
		expect(registry.get("good")).toBeTruthy();
	});

	it("surfaces a notice naming the file", async () => {
		const { host } = setup({ "init.js": `throw new Error("kaboom");` });

		await host.reload();

		expect(Notice.messages[0]).toContain("init.js");
		expect(Notice.messages[0]).toContain("kaboom");
	});

	it("leaves nothing behind when a script throws partway through", async () => {
		// Half-applied configuration is worse than none: the user would have
		// to guess which lines took effect.
		const { host, registry } = setup({
			"init.js": `vim.action("a", () => {}); vim.nmap("gz", "a"); throw new Error("late");`,
		});

		await host.reload();

		expect(registry.actions()).toHaveLength(0);
		expect(registry.bindings()).toHaveLength(0);
	});

	it("recovers the line number within the script", async () => {
		const { host } = setup({
			"init.js": `// line 1\n// line 2\nthrow new Error("here");`,
		});

		const result = await host.reload();

		expect(result.errors[0]?.line).toBe(3);
	});
});

describe("ScriptHost teardown", () => {
	it("removes the previous run's actions on reload", async () => {
		const { host, registry, app } = setup({
			"init.js": `vim.action("first", () => {});`,
		});
		await host.reload();
		expect(registry.get("first")).toBeTruthy();

		app.vault.adapter.files.set(
			`${FOLDER}/init.js`,
			`vim.action("second", () => {});`,
		);
		await host.reload();

		expect(registry.get("first")).toBeUndefined();
		expect(registry.get("second")).toBeTruthy();
	});

	it("does not accumulate bindings across reloads", async () => {
		const { host, registry } = setup({ "init.js": `vim.nmap("gz", "x");` });

		await host.reload();
		await host.reload();

		expect(registry.bindings()).toHaveLength(1);
	});

	it("removes a deleted script's registrations", async () => {
		const { host, registry, app } = setup({
			"init.js": `vim.action("a", () => {});`,
			"extra.js": `vim.action("b", () => {});`,
		});
		await host.reload();
		expect(registry.actions()).toHaveLength(2);

		app.vault.adapter.files.delete(`${FOLDER}/extra.js`);
		await host.reload();

		expect(registry.get("a")).toBeTruthy();
		expect(registry.get("b")).toBeUndefined();
	});

	it("clears everything on unload", async () => {
		const { host, registry } = setup({ "init.js": `vim.action("a", () => {});` });
		host.load();
		await host.reload();
		expect(registry.actions()).toHaveLength(1);

		host.unload();

		expect(registry.actions()).toHaveLength(0);
	});
});

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
