import { Plugin } from "obsidian";
import { createLifecycle } from "./container";
import type { Lifecycle } from "./lifecycle/lifecycle";

/** The plugin entry point. Everything it does lives in the lifecycle. */
export default class EditorImprovementsPlugin extends Plugin {
	lifecycle: Lifecycle | null = null;

	override async onload(): Promise<void> {
		this.lifecycle = createLifecycle(this);
		await this.lifecycle.load();
	}

	override onunload(): void {
		this.lifecycle?.unload();
	}
}
