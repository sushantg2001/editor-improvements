import { PluginSettingTab, Setting, normalizePath } from "obsidian";
import type { App } from "obsidian";

import {
	DEFAULT_SETTINGS,
	MODE_LABELS,
	SCRIPTS_FOLDER_NAME,
	VIM_MODES,
} from "./constants";
import type { VimToolsSettings } from "./types";
import type VimToolsPlugin from "./main";

/**
 * Where scripts live, honouring a custom config directory.
 *
 * `.obsidian` is only the default; `vault.configDir` is the truth.
 */
export function resolveScriptsFolder(app: App, settings: VimToolsSettings): string {
	const configured = settings.scriptsFolder.trim();
	if (configured) {
		return normalizePath(configured);
	}
	return normalizePath(`${app.vault.configDir}/${SCRIPTS_FOLDER_NAME}`);
}

export function mergeSettings(data: unknown): VimToolsSettings {
	const stored = (data ?? {}) as Partial<VimToolsSettings>;
	return {
		...DEFAULT_SETTINGS,
		...stored,
		modePrompts: { ...DEFAULT_SETTINGS.modePrompts, ...stored.modePrompts },
	};
}

export class VimToolsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: VimToolsPlugin,
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
