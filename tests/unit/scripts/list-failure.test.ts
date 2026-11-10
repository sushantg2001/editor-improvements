import { beforeEach, describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = "scripts";

function setup() {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.action("kept", () => {});`);
	const registry = new ActionRegistry();
	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const adapter = app.vault.adapter as unknown as { list: (path: string) => Promise<unknown> };
	const working = adapter.list.bind(adapter);
	return {
		host,
		registry,
		breakListing: () => {
			adapter.list = () => Promise.reject(new Error("EBUSY: resource busy"));
		},
		fixListing: () => {
			adapter.list = working;
		},
	};
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("a reload when the scripts folder cannot be listed", () => {
	it("resolves with the error instead of rejecting", async () => {
		const t = setup();
		await t.host.reload();
		t.breakListing();

		const result = await t.host.reload();

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toMatch(/Could not read the scripts folder: .*EBUSY/);
		expect(Notice.messages.join("\n")).toMatch(/Could not read the scripts folder/);
	});

	it("leaves the scripts that were running running", async () => {
		const t = setup();
		const first = await t.host.reload();
		t.breakListing();

		const second = await t.host.reload();

		expect(t.registry.has("kept")).toBe(true);
		expect(second.loaded).toEqual(first.loaded);
	});

	it("loads normally once the folder can be read again", async () => {
		const t = setup();
		await t.host.reload();
		t.breakListing();
		await t.host.reload();
		t.fixListing();

		const result = await t.host.reload();

		expect(result.errors).toEqual([]);
		expect(result.loaded).toEqual(["init.js"]);
	});
});
