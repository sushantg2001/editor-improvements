import { beforeEach, describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

function setup(files: Record<string, string>) {
	const app = new App();
	const registry = new ActionRegistry();
	app.vault.adapter.dirs.add(FOLDER);
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	let enabled = true;
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => enabled,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return {
		host,
		registry,
		write: (name: string, code: string) => app.vault.adapter.files.set(`${FOLDER}/${name}`, code),
		remove: (name: string) => app.vault.adapter.files.delete(`${FOLDER}/${name}`),
		enable: (value: boolean) => {
			enabled = value;
		},
	};
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("a script that stops working keeps its last working version", () => {
	it("so a typo mid-edit does not hand every key back to vim", async () => {
		const t = setup({ "init.js": `vim.action("a", () => {}); vim.nmap("gz", "a");` });
		await t.host.reload();

		t.write("init.js", `vim.action("a", () => {}); vim.nmap("gz", "a"); oops(`);
		const result = await t.host.reload();

		expect(t.registry.has("a")).toBe(true);
		expect(t.registry.bindings()).toHaveLength(1);
		expect(result.loaded).toEqual([]);
	});

	it("and says that it did", async () => {
		const t = setup({ "init.js": `vim.action("a", () => {});` });
		await t.host.reload();

		t.write("init.js", `throw new Error("broken");`);
		const result = await t.host.reload();

		expect(result.errors[0]?.message).toContain("broken");
		expect(result.errors[0]?.message).toContain("last working version of init.js stays in effect");
		expect(Notice.messages.some((m) => m.includes("stays in effect"))).toBe(true);
	});

	it("until the script is fixed, when the new version replaces it", async () => {
		const t = setup({ "init.js": `vim.action("old", () => {});` });
		await t.host.reload();
		t.write("init.js", `throw new Error("broken");`);
		await t.host.reload();

		t.write("init.js", `vim.action("new", () => {});`);
		const result = await t.host.reload();

		expect(result.errors).toEqual([]);
		expect(t.registry.has("new")).toBe(true);
		expect(t.registry.has("old")).toBe(false);
	});

	it("applies nothing for a script that never worked", async () => {
		const t = setup({ "init.js": `throw new Error("never");` });

		const result = await t.host.reload();

		expect(result.errors[0]?.message).not.toContain("stays in effect");
		expect(t.registry.actions()).toEqual([]);
	});

	it("does not disturb the scripts that are fine", async () => {
		const t = setup({
			"init.js": `vim.action("one", () => {});`,
			"more.js": `vim.action("two", () => {});`,
		});
		await t.host.reload();

		t.write("more.js", `vim.action("two-changed", () => {}); nope(`);
		t.write("init.js", `vim.action("one-changed", () => {});`);
		await t.host.reload();

		expect(t.registry.has("one-changed")).toBe(true);
		expect(t.registry.has("one")).toBe(false);
		expect(t.registry.has("two")).toBe(true);
	});

	it("lets a later script map to an action the failing script still provides", async () => {
		const t = setup({
			"init.js": `vim.action("shared", () => {});`,
			"keys.js": `vim.nmap("gz", "shared");`,
		});
		await t.host.reload();

		t.write("init.js", `vim.action("shared", () => {}); broken(`);
		const result = await t.host.reload();

		expect(t.registry.bindings()[0]?.target).toMatchObject({ kind: "action", id: "shared" });
		expect(result.loaded).toEqual(["keys.js"]);
	});

	it("keeps nothing for a script that was deleted", async () => {
		const t = setup({ "init.js": `vim.action("a", () => {});` });
		await t.host.reload();

		t.remove("init.js");
		await t.host.reload();

		expect(t.registry.actions()).toEqual([]);
	});

	it("keeps nothing while scripts are switched off, and does not bring it back", async () => {
		const t = setup({ "init.js": `vim.action("a", () => {});` });
		await t.host.reload();

		t.enable(false);
		await t.host.reload();
		expect(t.registry.actions()).toEqual([]);

		t.write("init.js", `broken(`);
		t.enable(true);
		await t.host.reload();

		expect(t.registry.actions()).toEqual([]);
	});
});
