import { type App, Modal, Setting } from "obsidian";

/** Asks once before the plugin changes anything. */
export class SetupModal extends Modal {
	private answered = false;

	constructor(app: App, private readonly configPath: string, private readonly onAnswer: (accepted: boolean) => void) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle("Set up Editor Improvements");
		this.contentEl.createEl("p", { text: "While the plugin runs, your Lua config decides what every key does." });
		const list = this.contentEl.createEl("ul");
		list.createEl("li", { text: `Creates a starter config at ${this.configPath} if there is none.` });
		list.createEl("li", { text: "Turns off the built-in vim mode and uses its own vim engine." });
		list.createEl("li", { text: "Replaces Obsidian's hotkeys with the keys in your config." });
		this.contentEl.createEl("p", { text: "Turning the plugin off puts all of this back. If keys ever stop working, press Ctrl+Alt+Shift+F12 for safe mode." });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Not now").onClick(() => this.answer(false)))
			.addButton((button) => button.setButtonText("Set up").setCta().onClick(() => this.answer(true)));
	}

	private answer(accepted: boolean): void {
		this.answered = true;
		this.close();
		this.onAnswer(accepted);
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.onAnswer(false);
	}
}
