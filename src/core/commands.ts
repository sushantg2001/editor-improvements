import type { Plugin } from "obsidian";

import type { VimDispatcher } from "./dispatch";
import type { ActionRegistry } from "./registry";
import type { CodeMirrorShim } from "../types";

/**
 * Mirrors the registry into Obsidian's command palette.
 *
 * Every action becomes a real command, which is what gives it a hotkey slot in
 * Settings → Hotkeys. That matters most for things Obsidian exposes only in a
 * right-click menu — Select all, Copy path, Paste as plain text — which have no
 * command of their own and so cannot be bound at all as Obsidian ships.
 *
 * Note that `Plugin.addCommand` force-prefixes ids with the manifest id, so
 * ours are `vim-tools:<id>`. Local names are kept byte-identical to the plugins
 * we replace so migration is a mechanical prefix swap.
 */
export class CommandSurface {
	private readonly registered = new Set<string>();

	constructor(
		private readonly plugin: Plugin,
		private readonly registry: ActionRegistry,
		private readonly dispatcher: VimDispatcher,
		private readonly getCm: () => CodeMirrorShim | null,
	) {}

	/** Adds commands for new actions and removes those whose action is gone. */
	sync(): void {
		const wanted = new Set<string>();

		for (const def of this.registry.actions()) {
			if (def.command === false) {
				continue;
			}
			wanted.add(def.id);
			if (this.registered.has(def.id)) {
				continue;
			}
			this.add(def.id, def.name, def.needsEditor !== false);
			this.registered.add(def.id);
		}

		for (const id of [...this.registered]) {
			if (!wanted.has(id)) {
				this.plugin.removeCommand(id);
				this.registered.delete(id);
			}
		}
	}

	clear(): void {
		for (const id of this.registered) {
			this.plugin.removeCommand(id);
		}
		this.registered.clear();
	}

	private add(id: string, name: string, needsEditor: boolean): void {
		if (needsEditor) {
			this.plugin.addCommand({
				id,
				name,
				editorCheckCallback: (checking) => {
					const cm = this.getCm();
					if (!cm) {
						return false;
					}
					if (!checking) {
						this.dispatcher.invoke(id, cm);
					}
					return true;
				},
			});
			return;
		}
		this.plugin.addCommand({
			id,
			name,
			callback: () => this.dispatcher.invoke(id, this.getCm()),
		});
	}
}
