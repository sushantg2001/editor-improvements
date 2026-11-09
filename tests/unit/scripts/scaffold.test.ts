import { beforeEach, describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { scaffoldScripts } from "../../../src/scripts/scaffold";
import { TYPINGS, TYPINGS_FILENAME } from "../../../src/scripts/typings";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = ".obsidian/vim-tools";

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("scaffoldScripts", () => {
	it("creates the folder with a starter init.js and the typings", async () => {
		const app = new App();

		await scaffoldScripts(app as never, FOLDER);

		const { files, dirs } = app.vault.adapter;
		expect(dirs.has(FOLDER)).toBe(true);
		expect(files.get(`${FOLDER}/init.js`)).toContain("vim.leader");
		expect(files.get(`${FOLDER}/${TYPINGS_FILENAME}`)).toBe(TYPINGS);
		expect(Notice.messages.at(-1)).toContain("created");
	});

	it("never overwrites an init.js the user already has", async () => {
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, "// mine");

		await scaffoldScripts(app as never, FOLDER);

		expect(app.vault.adapter.files.get(`${FOLDER}/init.js`)).toBe("// mine");
		expect(Notice.messages.at(-1)).toContain("left as is");
	});

	it("still refreshes the typings next to an existing init.js", async () => {
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, "// mine");
		app.vault.adapter.files.set(`${FOLDER}/${TYPINGS_FILENAME}`, "// old");

		await scaffoldScripts(app as never, FOLDER);

		expect(app.vault.adapter.files.get(`${FOLDER}/${TYPINGS_FILENAME}`)).toBe(TYPINGS);
	});

	it("reports a failure instead of throwing", async () => {
		const app = new App();
		app.vault.adapter.mkdir = async () => {
			throw new Error("read-only");
		};

		await expect(scaffoldScripts(app as never, FOLDER)).resolves.toBeUndefined();

		expect(Notice.messages.at(-1)).toContain("read-only");
	});

	it("writes a starter that the script host loads without a single complaint", async () => {
		// The starter is the first thing a new user runs. If the script API or its
		// validation moves on and leaves it behind, the first experience is an error.
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

		expect(result.errors).toEqual([]);
		expect(result.loaded).toEqual(["init.js"]);
		expect(registry.has("openToday")).toBe(true);
		expect(registry.has("toLastLine")).toBe(true);
		expect(registry.bindings().length).toBeGreaterThan(0);
	});
});
