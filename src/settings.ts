import { PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { App } from "obsidian";

import {
	DEFAULT_SETTINGS,
	MODE_LABELS,
	SCRIPTS_FOLDER_NAME,
	VIM_MODES,
} from "./constants";
import type { EditorImprovementsSettings } from "./types";
import type EditorImprovementsPlugin from "./main";

/**
 * Where scripts live, honouring a custom config directory.
 *
 * `.obsidian` is only the default; `vault.configDir` is the truth.
 */
export function resolveScriptsFolder(app: App, settings: EditorImprovementsSettings): string {
	const configured = settings.scriptsFolder.trim();
	if (configured) {
		return normalizePath(configured);
	}
	return normalizePath(`${app.vault.configDir}/${SCRIPTS_FOLDER_NAME}`);
}

/**
 * Builds settings from whatever `data.json` held.
 *
 * The file is user-editable and synced between devices, so a value can be the
 * wrong type or missing. Each field is accepted only if it has the right type
 * and otherwise falls back to its default, so a damaged file degrades to
 * defaults for that field instead of breaking startup.
 */
export function mergeSettings(data: unknown): EditorImprovementsSettings {
	const stored = isRecord(data) ? data : {};
	const defaults = DEFAULT_SETTINGS;
	const prompts = isRecord(stored.modePrompts) ? stored.modePrompts : {};

	const modePrompts = { ...defaults.modePrompts };
	for (const mode of VIM_MODES) {
		const value = prompts[mode];
		if (typeof value === "string" && value.length > 0) {
			modePrompts[mode] = value;
		}
	}

	return {
		showModeInStatusBar: booleanOr(stored.showModeInStatusBar, defaults.showModeInStatusBar),
		scriptsEnabled: booleanOr(stored.scriptsEnabled, defaults.scriptsEnabled),
		scriptsFolder: stringOr(stored.scriptsFolder, defaults.scriptsFolder),
		leader: stringOr(stored.leader, defaults.leader, true),
		modePrompts,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function stringOr(value: unknown, fallback: string, nonEmpty = false): string {
	return typeof value === "string" && (!nonEmpty || value.length > 0) ? value : fallback;
}

export class EditorImprovementsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: EditorImprovementsPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show mode in status bar")
			.setDesc("Display the current vim mode at the bottom of the window.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showModeInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showModeInStatusBar = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Scripts").setHeading();

		new Setting(containerEl)
			.setName("Run scripts from the vault")
			.setDesc(
				"Loads and executes every .js file in the folder below. These are " +
					"arbitrary scripts with full access to your vault, and a synced " +
					"vault will run them on every device. Only enable this if you " +
					"trust everything in that folder.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.scriptsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.scriptsEnabled = value;
						await this.plugin.saveSettings();
						await this.plugin.reloadScripts();
					}),
			);

		new Setting(containerEl)
			.setName("Scripts folder")
			.setDesc(
				`Relative to the vault root. Leave empty to use ` +
					`${this.app.vault.configDir}/${SCRIPTS_FOLDER_NAME}. ` +
					`init.js loads first, then the rest.`,
			)
			.addText((text) =>
				text
					.setPlaceholder(`${this.app.vault.configDir}/${SCRIPTS_FOLDER_NAME}`)
					.setValue(this.plugin.settings.scriptsFolder)
					.onChange(async (value) => {
						this.plugin.settings.scriptsFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.reloadScripts();
					}),
			);

		new Setting(containerEl)
			.setName("Leader key")
			.setDesc("What <leader> expands to in mappings. A script may override it.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.leader)
					.setValue(this.plugin.settings.leader)
					.onChange(async (value) => {
						this.plugin.settings.leader = value || DEFAULT_SETTINGS.leader;
						await this.plugin.saveSettings();
						await this.plugin.reloadScripts();
					}),
			);

		new Setting(containerEl).setName("Mode labels").setHeading();

		for (const mode of VIM_MODES) {
			new Setting(containerEl)
				.setName(MODE_LABELS[mode])
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.modePrompts[mode])
						.setValue(this.plugin.settings.modePrompts[mode])
						.onChange(async (value) => {
							this.plugin.settings.modePrompts[mode] =
								value || DEFAULT_SETTINGS.modePrompts[mode];
							await this.plugin.saveSettings();
						}),
				);
		}
	}
}
