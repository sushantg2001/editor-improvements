import { describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";
const settle = () => new Promise((resolve) => window.setTimeout(resolve, 220));

function host(files: Record<string, string>) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	const scripts = new ScriptHost({
		app: app as never,
		registry: new ActionRegistry(),
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { app, scripts };
}

describe("a scripts folder with files an editor or the system left beside the scripts", () => {
	it("runs only the real scripts, and says nothing about the rest", async () => {
		Notice.messages.length = 0;
		const { scripts } = host({
			"init.js": `vim.action("real", () => {});`,
			"._init.js": "\u0000\u0005\u0016\u0007 not javascript",
			".#init.js": "",
		});

		const result = await scripts.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(result.errors).toEqual([]);
		expect(Notice.messages).toEqual([]);
	});

	it("does not reload when only a hidden file changes", async () => {
		const { app, scripts } = host({ "init.js": "" });
		const reload = vi.spyOn(scripts, "reload");
		scripts.load();
		reload.mockClear();

		app.vault.trigger("raw", `${FOLDER}/._init.js`);
		app.vault.trigger("raw", `${FOLDER}/.#init.js`);
		await settle();

		expect(reload).not.toHaveBeenCalled();
	});

	it("still reloads when a real script changes", async () => {
		const { app, scripts } = host({ "init.js": "" });
		const reload = vi.spyOn(scripts, "reload");
		scripts.load();
		reload.mockClear();

		app.vault.trigger("raw", `${FOLDER}/init.js`);
		await settle();

		expect(reload).toHaveBeenCalledOnce();
	});
});
