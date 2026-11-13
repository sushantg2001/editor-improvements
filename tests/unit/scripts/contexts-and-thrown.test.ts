import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = "scripts";

async function error(code: string) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, code);
	const host = new ScriptHost({
		app: app as never,
		registry: new ActionRegistry(),
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return (await host.reload()).errors[0]?.message;
}

describe("contexts passed to map and bind", () => {
	it.each([
		['vim.map("x", "y", "normal");', '"normal"'],
		['vim.bind("x", "y", "normal");', '"normal"'],
		['vim.map("x", "y", null);', "null"],
		['vim.map("x", "y", 5);', "number"],
	])("must be a list: %s", async (code, shown) => {
		const message = await error(code);

		expect(message).toContain("contexts is a list");
		expect(message).toContain(shown);
		expect(message).not.toMatch(/unknown context "n"/);
	});

	it("can still be a list, or left out", async () => {
		expect(await error('vim.map("x", "y", ["normal", "visual"]);')).toBeUndefined();
		expect(await error('vim.map("x", "y");')).toBeUndefined();
	});
});

describe("a script that throws something that is not an Error", () => {
	it("reports the message of an object that has one", async () => {
		expect(await error('throw { message: "went wrong" };')).toBe("went wrong");
	});

	it("still reports a plain string, null and a number", async () => {
		expect(await error('throw "plain";')).toBe("plain");
		expect(await error("throw null;")).toBe("null");
		expect(await error("throw 42;")).toBe("42");
	});

	it("falls back to String() for an object without a message", async () => {
		expect(await error("throw { code: 1 };")).toBe("[object Object]");
	});
});
