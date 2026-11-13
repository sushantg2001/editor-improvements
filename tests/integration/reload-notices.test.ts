import { beforeEach, describe, expect, it } from "vitest";

import EditorImprovementsPlugin from "../../src/main";
import { App, Notice } from "../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

beforeEach(() => {
	Notice.messages.length = 0;
});

async function plugin(scripts: Record<string, string>, enabled = true) {
	const app = new App();
	if (Object.keys(scripts).length > 0) {
		app.vault.adapter.dirs.add(FOLDER);
	}
	for (const [name, code] of Object.entries(scripts)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	const instance = new EditorImprovementsPlugin(app as never, {} as never);
	await instance.onload();
	instance.settings.scriptsEnabled = enabled;
	Notice.messages.length = 0;
	return instance;
}

describe("what reloading the scripts tells the user", () => {
	it("says how many scripts it loaded", async () => {
		const p = await plugin({ "init.js": "", "more.js": "" });

		await p.reloadScripts();

		expect(Notice.messages).toEqual(["Editor Improvements: loaded 2 script(s)."]);
	});

	it("says there are none, and where it looked", async () => {
		const p = await plugin({});

		await p.reloadScripts();

		expect(Notice.messages).toEqual([`Editor Improvements: no scripts found in ${FOLDER}.`]);
	});

	it("leaves the summary out when a script failed, since the failure was reported already", async () => {
		const p = await plugin({ "init.js": "throw new Error('broken');" });

		await p.reloadScripts();

		expect(Notice.messages).toHaveLength(1);
		expect(Notice.messages[0]).toContain("broken");
		expect(Notice.messages.join("\n")).not.toMatch(/loaded|no scripts found/);
	});

	it("says nothing at all while scripts are switched off", async () => {
		const p = await plugin({ "init.js": "" }, false);

		await p.reloadScripts();

		expect(Notice.messages).toEqual([]);
	});
});
