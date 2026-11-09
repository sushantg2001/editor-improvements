import { Component, Notice } from "obsidian";

import { CommandSurface } from "./commands";
import { MappingLedger, resolveBindings } from "./keymap";
import type { VimDispatcher } from "./dispatch";
import type { ActionRegistry } from "./registry";
import type { VimBridge } from "./vim-bridge";

export interface RuntimeOptions {
	registry: ActionRegistry;
	bridge: VimBridge;
	dispatcher: VimDispatcher;
	commands: CommandSurface;
}

/**
 * Projects the registry onto the two surfaces that can run an action: vim's
 * keymap and Obsidian's command palette.
 *
 * There is exactly one way state reaches the outside world — `rebuild()` — and
 * exactly two things that trigger it: the registry changing, or vim becoming
 * available or going away. Anything that wants to change behaviour changes a
 * contribution in the registry and lets this run; nothing applies keys or
 * registers commands on its own.
 */
export class EditorImprovementsRuntime extends Component {
	private readonly ledger = new MappingLedger();

	constructor(private readonly options: RuntimeOptions) {
		super();
	}

	override onload(): void {
		const { registry, bridge } = this.options;
		this.register(registry.onChange(() => this.rebuild()));
		bridge.onAvailable(() => this.rebuild());
		bridge.onUnavailable(() => this.releaseKeys());
		// Teardown must outlive the bridge's own unload, hence the explicit
		// registration rather than relying on onunload ordering.
		this.register(() => this.releaseKeys());
		this.rebuild();
	}

	/** Keys currently handed to vim. Exposed for the status command. */
	get mappedKeyCount(): number {
		return this.ledger.size;
	}

	/** Re-derives both surfaces from the registry. Safe to call repeatedly. */
	rebuild(): void {
		this.options.commands.sync();

		const vim = this.options.bridge.vim;
		if (!vim) {
			return;
		}
		const { bindings, conflicts } = resolveBindings(this.options.registry);
		this.ledger.apply(vim, this.options.dispatcher, bindings, this.options.registry.unmaps());
		this.reportConflicts(conflicts);
	}

	private releaseKeys(): void {
		const vim = this.options.bridge.vim;
		if (vim) {
			this.ledger.clear(vim);
		}
	}

	private reportConflicts(conflicts: ReturnType<typeof resolveBindings>["conflicts"]): void {
		for (const conflict of conflicts) {
			new Notice(
				`Editor Improvements: "${conflict.keys}" (${conflict.context}) claimed by ` +
					`${conflict.sources.join(", ")} — using ${conflict.winner}.`,
				8000,
			);
		}
	}
}
