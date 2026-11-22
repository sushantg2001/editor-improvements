import type { App } from "obsidian";

interface VaultConfig {
	getConfig(key: string): unknown;
	setConfig(key: string, value: unknown): void;
	saveConfig(): Promise<void>;
}

const config = (app: App): VaultConfig => app.vault as unknown as VaultConfig;

export function builtinVimOn(app: App): boolean {
	return config(app).getConfig("vimMode") === true;
}

export function setBuiltinVim(app: App, on: boolean): void {
	config(app).setConfig("vimMode", on);
	// Obsidian delays this save, and the app could close before it happens.
	void config(app).saveConfig();
	(app.workspace as unknown as { updateOptions(): void }).updateOptions();
}
