import { Menu, type Plugin } from "obsidian";

/** What the interface needs from the lifecycle. */
export interface UiController {
	readonly state: "inactive" | "active" | "safe";
	readonly reason: string;
	readonly configErrors: readonly string[];
	readonly configPath: string;
	configFolder: string;
	statusText(): string;
	reload(): Promise<boolean>;
	toggleSafeMode(): void;
	openConfig(): void;
	setUp(): Promise<void>;
	saveConfigFolder(folder: string): Promise<void>;
}

export class StatusBar {
	private readonly element: HTMLElement;
	private frame: number | null = null;

	constructor(plugin: Plugin, private readonly controller: UiController) {
		this.element = plugin.addStatusBarItem();
		this.element.addClass("editor-improvements-status");
		plugin.registerDomEvent(this.element, "click", (event) => this.openMenu(event));
		this.render();
	}

	/** Updates on the next frame, after the editor has handled the key. */
	refresh(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.render();
		});
	}

	private render(): void {
		const { state } = this.controller;
		this.element.setText(this.controller.statusText());
		this.element.toggleClass("is-safe", state === "safe");
		this.element.toggle(state !== "inactive");
	}

	private openMenu(event: MouseEvent): void {
		const { controller } = this;
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Reload config").setIcon("refresh-cw").onClick(() => void controller.reload()));
		menu.addItem((item) => item.setTitle(controller.state === "safe" ? "Leave safe mode" : "Enter safe mode").setIcon("shield").onClick(() => controller.toggleSafeMode()));
		menu.addItem((item) => item.setTitle("Open config").setIcon("file-code").onClick(() => controller.openConfig()));
		menu.showAtMouseEvent(event);
	}
}
