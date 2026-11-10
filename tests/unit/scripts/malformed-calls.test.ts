import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { validateContribution } from "../../../src/core/validate";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";
import type { VimActionDef } from "../../../src/types";

const FOLDER = ".obsidian/editor-improvements";

async function load(files: Record<string, string>) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	const registry = new ActionRegistry();
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { registry, result: await host.reload() };
}

describe("a script that calls the API with the wrong kind of value", () => {
	it.each([
		["an id that is a number", `vim.action(5, () => {});`],
		["a name that is a number", `vim.action("a", () => {}, { name: 5 });`],
		["a group that is a number", `vim.action("a", () => {}, { group: 5 });`],
	])("with %s does not stop the other scripts", async (_what, bad) => {
		const { registry, result } = await load({
			"init.js": bad,
			"other.js": `vim.action("fine", () => {});`,
		});

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.file).toBe("init.js");
		expect(result.loaded).toEqual(["other.js"]);
		expect(registry.actions().map((a) => a.id)).toEqual(["fine"]);
	});

	it("takes null options as no options", async () => {
		const { registry, result } = await load({ "init.js": `vim.action("a", () => {}, null);` });

		expect(result.errors).toEqual([]);
		expect(registry.get("a")).toMatchObject({ name: "a", group: "Scripts" });
	});

	it("refuses a result mode that is not insert or normal", async () => {
		const { result } = await load({ "init.js": `vim.action("a", () => {}, { resultMode: "Insert" });` });

		expect(result.errors[0]?.message).toContain("resultMode");
	});

	it.each([
		["no right-hand side", `vim.nmap("x");`],
		["keys that are a number", `vim.nmap(5, "y");`],
		["a right-hand side that is a number", `vim.nnoremap("x", 5);`],
	])("says what a mapping needs, for %s", async (_what, code) => {
		const { result } = await load({ "init.js": code });

		expect(result.errors[0]?.message).toMatch(/mapping needs keys and a right-hand side/);
	});

	it("says what bind needs", async () => {
		const { result } = await load({ "init.js": `vim.bind("x");` });

		expect(result.errors[0]?.message).toMatch(/vim\.bind needs keys and an action id/);
	});
});

describe("validating a contribution of the wrong types", () => {
	const action = (extra: Record<string, unknown>): VimActionDef =>
		({ id: "a", name: "A", group: "G", kind: "action", run: () => undefined, ...extra });

	it("reports instead of throwing", () => {
		expect(() => validateContribution({ actions: [action({ name: 5, group: null, id: 7 })] })).not.toThrow();

		const problems = validateContribution({ actions: [action({ name: 5, group: null, id: 7 })] });
		expect(problems.join("\n")).toMatch(/ids start with a letter/);
		expect(problems.join("\n")).toMatch(/needs a name/);
		expect(problems.join("\n")).toMatch(/needs a group/);
	});

	it("accepts the two result modes and none", () => {
		for (const resultMode of [undefined, "insert", "normal"]) {
			expect(validateContribution({ actions: [action({ resultMode })] })).toEqual([]);
		}
	});
});
