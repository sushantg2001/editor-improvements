import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/constants";
import { mergeSettings, resolveScriptsFolder } from "../../src/settings";
import { App } from "../mocks/obsidian";

describe("mergeSettings", () => {
	it("falls back to defaults for missing data", () => {
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps stored values", () => {
		const merged = mergeSettings({ showModeInStatusBar: false });
		expect(merged.showModeInStatusBar).toBe(false);
		expect(merged.modePrompts).toEqual(DEFAULT_SETTINGS.modePrompts);
	});

	it("merges mode prompts per mode instead of replacing the whole map", () => {
		const merged = mergeSettings({ modePrompts: { normal: "N" } });
		expect(merged.modePrompts.normal).toBe("N");
		expect(merged.modePrompts.insert).toBe(DEFAULT_SETTINGS.modePrompts.insert);
	});

	it("gains defaults for settings added after data.json was written", () => {
		// An old data.json predates the scripts settings entirely.
		const merged = mergeSettings({ showModeInStatusBar: false });
		expect(merged.scriptsEnabled).toBe(false);
		expect(merged.leader).toBe(DEFAULT_SETTINGS.leader);
	});
});

describe("resolveScriptsFolder", () => {
	it("defaults to a folder inside the vault's config directory", () => {
		const app = new App();
		expect(resolveScriptsFolder(app as never, mergeSettings({}))).toBe(
			".obsidian/editor-improvements",
		);
	});

	it("follows a renamed config directory", () => {
		// `.obsidian` is only the default — users can change it, and hardcoding
		// it would send scripts to a folder Obsidian never reads.
		const app = new App();
		app.vault.configDir = ".my-config";

		expect(resolveScriptsFolder(app as never, mergeSettings({}))).toBe(
			".my-config/editor-improvements",
		);
	});

	it("honours an explicit folder", () => {
		const app = new App();
		const settings = mergeSettings({ scriptsFolder: "config/vim" });

		expect(resolveScriptsFolder(app as never, settings)).toBe("config/vim");
	});

	it("treats a whitespace-only folder as unset", () => {
		const app = new App();
		const settings = mergeSettings({ scriptsFolder: "   " });

		expect(resolveScriptsFolder(app as never, settings)).toBe(".obsidian/editor-improvements");
	});
});
