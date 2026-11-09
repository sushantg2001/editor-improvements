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
	/** What each registered command was registered with, to notice when it changes. */
	private readonly registered = new Map<string, { name: string; needsEditor: boolean }>();

	constructor(
		private readonly plugin: Plugin,
		private readonly registry: ActionRegistry,
		private readonly dispatcher: VimDispatcher,
		private readonly getCm: () => CodeMirrorShim | null,
	) {}

	/**
	 * Adds commands for new actions, removes those whose action is gone, and
	 * re-registers one whose name or editor requirement has changed.
	 *
	 * A command's name and kind are fixed when it is added, so an action that a
	 * script edit renames, or turns into one that needs no editor, would
	 * otherwise keep its old palette entry until Obsidian restarted.
	 */
	sync(): void {
		const wanted = new Set<string>();

		for (const def of this.registry.actions()) {
			if (def.command === false) {
				continue;
			}
			wanted.add(def.id);
			const next = { name: def.name, needsEditor: def.needsEditor !== false };
			const current = this.registered.get(def.id);
			if (current?.name === next.name && current.needsEditor === next.needsEditor) {
				continue;
			}
			if (current) {
				this.plugin.removeCommand(def.id);
			}
			this.add(def.id, next.name, next.needsEditor);
			this.registered.set(def.id, next);
		}

		for (const id of [...this.registered.keys()]) {
			if (!wanted.has(id)) {
				this.plugin.removeCommand(id);
				this.registered.delete(id);
			}
		}
	}

	clear(): void {
		for (const id of this.registered.keys()) {
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
