import { Component } from "obsidian";
import type { App, EventRef } from "obsidian";

import type { VimApi } from "../types";

/** Obsidian sets `window.CodeMirrorAdapter = CodeMirror` and `CodeMirror.Vim = vimApi`. */
interface CodeMirrorAdapterGlobal {
	Vim?: VimApi;
}

interface AppWithVim extends App {
	isVimEnabled?(): boolean;
}

/**
 * Reads the Vim API off the window, or null if it is not there yet.
 *
 * Obsidian only installs the CodeMirror vim extensions when vim mode is on in
 * Settings, and only once the first editor has been constructed, so this is
 * null both before layout is ready and whenever vim mode is off.
 */
export function readVimApi(): VimApi | null {
	const adapter = (window as unknown as { CodeMirrorAdapter?: CodeMirrorAdapterGlobal })
		.CodeMirrorAdapter;
	return adapter?.Vim ?? null;
}

export function isVimEnabled(app: App): boolean {
	return (app as AppWithVim).isVimEnabled?.() ?? false;
}

/**
 * Gates the rest of the plugin on the Vim API being available.
 *
 * Obsidian rebuilds its editor extensions when the `vimMode` setting changes,
 * so this keeps watching after the first resolution and fires `onAvailable` /
 * `onUnavailable` as vim mode is toggled during a session.
 */
export class VimBridge extends Component {
	private api: VimApi | null = null;
	private readonly availableCallbacks: ((api: VimApi) => void)[] = [];
	private readonly unavailableCallbacks: (() => void)[] = [];

	constructor(private readonly app: App) {
		super();
	}

	override onload(): void {
		this.app.workspace.onLayoutReady(() => this.refresh());
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.refresh()),
		);
		this.registerEvent(this.app.workspace.on("file-open", () => this.refresh()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refresh()));
		this.watchVimModeSetting();
	}

	/**
	 * Picks up Settings → Editor → Vim mode being toggled.
	 *
	 * The workspace events above only fire when the user moves between leaves,
	 * so without this the plugin stays dormant until the next click. There is
	 * no public event for it; `vault.on("config-changed", key)` is undocumented
	 * but is what Obsidian fires, so it is used defensively and the workspace
	 * events remain as the fallback.
	 */
	private watchVimModeSetting(): void {
		try {
			const vault = this.app.vault as unknown as {
				on(name: string, cb: (key: string) => void): EventRef;
			};
			this.registerEvent(
				vault.on("config-changed", (key: string) => {
					if (key === "vimMode") {
						this.refresh();
					}
				}),
			);
		} catch {
			// Undocumented API; the workspace events still cover the common case.
		}
	}

	override onunload(): void {
		this.availableCallbacks.length = 0;
		this.unavailableCallbacks.length = 0;
		// `api` is deliberately *not* cleared. Obsidian unloads children before
		// running registered cleanups, so anything tearing down during unload
		// would find a null here and silently skip its work — which is how the
		// keymap used to leak. Keeping the reference means there is exactly one
		// way to reach the Vim API, at every point in the lifecycle.
	}

	/** The Vim API, or null if vim mode is off or no editor exists yet. */
	get vim(): VimApi | null {
		return this.api;
	}

	/**
	 * Runs `callback` once the Vim API is available, and again after every
	 * disable/re-enable cycle.
	 */
	onAvailable(callback: (api: VimApi) => void): void {
		this.availableCallbacks.push(callback);
		if (this.api) {
			callback(this.api);
		}
	}

	onUnavailable(callback: () => void): void {
		this.unavailableCallbacks.push(callback);
	}

	/** Re-reads the environment and fires callbacks on a transition. */
	refresh(): void {
		const next = isVimEnabled(this.app) ? readVimApi() : null;
		if (next === this.api) {
			return;
		}
		this.api = next;
		if (next) {
			for (const callback of this.availableCallbacks) {
				callback(next);
			}
		} else {
			for (const callback of this.unavailableCallbacks) {
				callback();
			}
		}
	}
}
