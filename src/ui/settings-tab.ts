import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import type { UiController } from "./status-bar";

const STATE_NAMES = { inactive: "Inactive", active: "Active", safe: "Safe mode" };

export class EditorSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly controller: UiController) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl, controller } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Status").setDesc(`${STATE_NAMES[controller.state]}${controller.reason ? `: ${controller.reason}` : ""}`).addButton((button) => {
			if (controller.state === "inactive") {
				button.setButtonText("Set up").setCta().onClick(async () => {
					await controller.setUp();
					this.display();
				});
			} else {
				button.setButtonText(controller.state === "safe" ? "Leave safe mode" : "Enter safe mode").onClick(() => {
					controller.toggleSafeMode();
					this.display();
				});
			}
		});

		new Setting(containerEl)
			.setName("Config folder")
			.setDesc(`The folder that holds init.lua, relative to the vault. In use: ${controller.configPath}`)
			.addText((text) => {
				text.setPlaceholder(controller.configPath).setValue(controller.configFolder);
				text.inputEl.addEventListener("blur", () => {
					void controller.saveConfigFolder(text.getValue()).then(() => this.display());
				});
			});

		new Setting(containerEl)
			.setName("Config")
			.addButton((button) => button.setButtonText("Open").onClick(() => controller.openConfig()))
			.addButton((button) => button.setButtonText("Reload").onClick(async () => {
				await controller.reload();
				this.display();
			}));

		if (controller.configErrors.length > 0) {
			new Setting(containerEl).setName("Config errors").setHeading();
			for (const error of controller.configErrors) containerEl.createEl("pre", { text: error, cls: "editor-improvements-error" });
		}
	}
}
