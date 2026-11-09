import { Component } from "obsidian";
import type { App } from "obsidian";

import { CmListeners } from "./cm-listeners";
import { getActiveCm, getVimMode } from "./editor";
import type { VimMode } from "../types";

interface VimModeChangeEvent {
	mode?: string;
	subMode?: string;
}

/**
 * Tracks the active editor's vim mode and fans it out to listeners.
 *
 * `vim-mode-change` lives on each editor's CodeMirror instance rather than on
 * the app, so handlers are attached per editor as the active one changes.
 */
export class ModeTracker extends Component {
	private mode: VimMode = "normal";
	private readonly listeners: ((mode: VimMode) => void)[] = [];
	private readonly modeChanges = new CmListeners(
		"vim-mode-change",
		() => (...args: unknown[]) => {
			this.handleModeChange(args[0] as VimModeChangeEvent | undefined);
		},
	);

	constructor(private readonly app: App) {
		super();
	}

	override onload(): void {
		this.register(() => this.modeChanges.detachAll());
		this.app.workspace.onLayoutReady(() => this.attachToActiveEditor());
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.attachToActiveEditor()),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.attachToActiveEditor()),
		);
	}

	get current(): VimMode {
		return this.mode;
	}

	onChange(listener: (mode: VimMode) => void): () => void {
		this.listeners.push(listener);
		listener(this.mode);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/** Attaches to the active editor and re-syncs the mode from its vim state. */
	attachToActiveEditor(): void {
		const cm = getActiveCm(this.app);
		if (!cm) {
			return;
		}
		this.modeChanges.attach(cm);
		this.setMode(getVimMode(cm));
	}

	private handleModeChange(event: VimModeChangeEvent | undefined): void {
		switch (event?.mode) {
			case "insert":
			case "visual":
			case "replace":
				this.setMode(event.mode);
				break;
			default:
				this.setMode("normal");
		}
	}

	private setMode(mode: VimMode): void {
		if (mode === this.mode) {
			return;
		}
		this.mode = mode;
		for (const listener of this.listeners) {
			listener(mode);
		}
	}
}
