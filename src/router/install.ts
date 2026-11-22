import type { App, Scope } from "obsidian";
import { log } from "../diagnostics/log";
import { keepOnTop, newScope, removeFromStack, removeHotkeyEntry, watchScopes } from "./obsidian-internals";

/** Keeps the router's scope on top of every window, and owns the hotkey takeover. */
export class ScopeInstaller {
	private readonly scope: Scope;
	private readonly windows = new Set<Window>();
	private unwatch: (() => void) | null = null;
	private restoreHotkeys: (() => void) | null = null;

	constructor(private readonly app: App, handler: (event: KeyboardEvent) => false | undefined) {
		this.scope = newScope(handler);
	}

	install(): void {
		this.unwatch = watchScopes(this.app, () => this.syncAll());
		this.addWindow(window);
	}

	addWindow(win: Window): void {
		this.windows.add(win);
		keepOnTop(this.app, win, this.scope);
	}

	removeWindow(win: Window): void {
		this.windows.delete(win);
	}

	private syncAll(): void {
		for (const win of this.windows) {
			try {
				keepOnTop(this.app, win, this.scope);
			} catch (error) {
				log("warn", "router", `lost a window: ${String(error)}`);
				this.windows.delete(win);
			}
		}
	}

	uninstall(): void {
		this.unwatch?.();
		this.unwatch = null;
		for (const win of this.windows) {
			try {
				removeFromStack(this.app, win, this.scope);
			} catch (error) {
				log("warn", "router", `could not leave a window: ${String(error)}`);
			}
		}
		this.windows.clear();
	}

	get takenOver(): boolean {
		return this.restoreHotkeys !== null;
	}

	/** Switches Obsidian's hotkeys off. Returns false if they could not be found. */
	takeover(): boolean {
		if (this.restoreHotkeys) return true;
		this.restoreHotkeys = removeHotkeyEntry(this.app);
		return this.restoreHotkeys !== null;
	}

	release(): void {
		this.restoreHotkeys?.();
		this.restoreHotkeys = null;
	}
}
