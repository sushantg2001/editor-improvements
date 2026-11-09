import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/constants";
import EditorImprovementsPlugin from "../../src/main";
import { EditorImprovementsSettingTab } from "../../src/settings";
import { App, Setting } from "../mocks/obsidian";

beforeEach(() => {
	Setting.created.length = 0;
});

afterEach(() => {
	Setting.created.length = 0;
});

async function open() {
	const plugin = new EditorImprovementsPlugin(new App() as never, {} as never);
	await plugin.onload();
	const tab = (plugin as unknown as { settingTab: EditorImprovementsSettingTab }).settingTab;
	// The tab still renders through display(); declarative definitions need Obsidian 1.13.
	(tab as unknown as { display(): void }).display();
	const named = (name: string) => {
		const setting = Setting.created.find((s) => s.name === name);
		if (!setting) {
			throw new Error(`no setting "${name}"`);
		}
		return setting.components[0]!;
	};
	return { plugin, named };
}

describe("settings tab", () => {
	it("shows every control the plugin has a setting for", async () => {
		await open();

		expect(Setting.created.filter((s) => !s.heading).map((s) => s.name)).toEqual([
			"Show mode in status bar",
			"Run scripts from the vault",
			"Scripts folder",
			"Leader key",
			"Continue lists on new lines",
			"Normal",
			"Insert",
			"Visual",
			"Visual line",
			"Visual block",
			"Replace",
		]);
	});

	it("starts each control at the saved value", async () => {
		const { named } = await open();

		expect(named("Show mode in status bar").value).toBe(DEFAULT_SETTINGS.showModeInStatusBar);
		expect(named("Continue lists on new lines").value).toBe(true);
		expect(named("Leader key").value).toBe(DEFAULT_SETTINGS.leader);
	});

	it("saves a toggled setting", async () => {
		const { plugin, named } = await open();

		named("Continue lists on new lines").changeHandler?.(false);
		await Promise.resolve();

		expect(plugin.settings.autoInsertListPrefix).toBe(false);
		expect((plugin as unknown as { settingsData: { autoInsertListPrefix: boolean } }).settingsData.autoInsertListPrefix).toBe(false);
	});

	it("falls back to the default leader when the field is cleared", async () => {
		const { plugin, named } = await open();

		named("Leader key").changeHandler?.("");

		expect(plugin.settings.leader).toBe(DEFAULT_SETTINGS.leader);
	});

	it("falls back to the default label when a mode label is cleared", async () => {
		const { plugin, named } = await open();

		named("Insert").changeHandler?.("");
		expect(plugin.settings.modePrompts.insert).toBe(DEFAULT_SETTINGS.modePrompts.insert);

		named("Insert").changeHandler?.("INS");
		expect(plugin.settings.modePrompts.insert).toBe("INS");
	});

	it("trims the scripts folder", async () => {
		const { plugin, named } = await open();

		named("Scripts folder").changeHandler?.("  config/vim  ");

		expect(plugin.settings.scriptsFolder).toBe("config/vim");
	});
});
