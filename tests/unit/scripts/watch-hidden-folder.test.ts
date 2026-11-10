import { describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

/**
 * Obsidian keeps anything under a dot-folder out of the vault, so for the
 * default scripts folder (`.obsidian/editor-improvements`) it sends no modify,
 * create, delete or rename; it sends `raw`, with a path, for every change.
 */

const FOLDER = ".obsidian/editor-improvements";
const settle = () => new Promise((resolve) => window.setTimeout(resolve, 220));

function watched() {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, "");
	const host = new ScriptHost({
		app: app as never,
		registry: new ActionRegistry(),
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const reload = vi.spyOn(host, "reload");
	host.load();
	reload.mockClear();
	return { app, reload, raw: (path: string) => app.vault.trigger("raw", path) };
}

describe("saving a script in a hidden folder", () => {
	it("reloads, from the raw event Obsidian sends for it", async () => {
		const t = watched();

		t.raw(`${FOLDER}/init.js`);
		await settle();

		expect(t.reload).toHaveBeenCalledOnce();
	});

	it("reloads once for a burst of raw events", async () => {
		const t = watched();

		t.raw(`${FOLDER}/init.js`);
		t.raw(`${FOLDER}/init.js`);
		t.raw(`${FOLDER}/more.js`);
		await settle();

		expect(t.reload).toHaveBeenCalledOnce();
	});

	it("ignores the typings file the plugin writes itself, which would loop", async () => {
		const t = watched();

		t.raw(`${FOLDER}/editor-improvements.d.ts`);
		await settle();

		expect(t.reload).not.toHaveBeenCalled();
	});

	it("ignores other files in the config folder, and a sibling folder with the same start", async () => {
		const t = watched();

		t.raw(".obsidian/hotkeys.json");
		t.raw(".obsidian/plugins/other/main.js");
		t.raw(`${FOLDER}-old/init.js`);
		await settle();

		expect(t.reload).not.toHaveBeenCalled();
	});
});
