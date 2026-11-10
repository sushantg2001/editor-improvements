import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

async function loadedOrder(names: string[]): Promise<string[]> {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	for (const name of names) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, "");
	}
	const host = new ScriptHost({
		app: app as never,
		registry: new ActionRegistry(),
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return (await host.reload()).loaded;
}

describe("the order scripts run in", () => {
	it("is by character code, the same on every device and in every language setting", async () => {
		// A locale-aware sort puts these in a different order, and a different one per locale.
		const loaded = await loadedOrder(["a.js", "B.js", "a-b.js", "_x.js", "Z.js", "é.js", "10.js", "9.js"]);

		expect(loaded).toEqual(["10.js", "9.js", "B.js", "Z.js", "_x.js", "a-b.js", "a.js", "é.js"]);
	});

	it("still runs init.js first", async () => {
		const loaded = await loadedOrder(["00.js", "B.js", "init.js", "a.js"]);

		expect(loaded).toEqual(["init.js", "00.js", "B.js", "a.js"]);
	});

	it("ignores files that are not scripts", async () => {
		const loaded = await loadedOrder(["notes.md", "init.js", "editor-improvements.d.ts", "init.js.bak"]);

		expect(loaded).toEqual(["init.js"]);
	});
});
