import type {
	ActionSource,
	BindingContext,
	VimActionDef,
	VimActionKind,
} from "../types";

/** What a key resolves to: one of our actions, or a plain vim remap. */
export type BindingTarget =
	| { kind: "action"; id: string; actionKind: VimActionKind }
	| { kind: "keys"; rhs: string; recursive: boolean };

export interface BindingSpec {
	keys: string;
	contexts: BindingContext[];
	target: BindingTarget;
}

/** Everything one source contributes, applied and removed as a unit. */
export interface Contribution {
	actions?: VimActionDef[];
	bindings?: BindingSpec[];
}

/** A binding together with the source that asked for it. */
export interface SourcedBinding extends BindingSpec {
	source: ActionSource;
}

/**
 * The single source of truth for everything the plugin can do.
 *
 * Contributions are keyed by source — a builtin module, or one script file —
 * and replaced wholesale. That is the only way state enters the plugin, and it
 * is what makes reload trivially correct: re-setting a source's contribution
 * removes its previous actions and bindings in the same step, with no separate
 * teardown path to forget.
 *
 * Sources keep their insertion order, so "later wins" is stable across
 * reloads: builtins first, then scripts in load order.
 */
export class ActionRegistry {
	private readonly contributions = new Map<ActionSource, Contribution>();
	private readonly listeners: (() => void)[] = [];
	private suppressed = false;
	private dirty = false;

	/** Replaces everything `source` contributes. */
	set(source: ActionSource, contribution: Contribution): void {
		this.contributions.set(source, contribution);
		this.notify();
	}

	/** Removes everything `source` contributed. */
	remove(source: ActionSource): boolean {
		const removed = this.contributions.delete(source);
		if (removed) {
			this.notify();
		}
		return removed;
	}

	clear(): void {
		this.contributions.clear();
		this.notify();
	}

	/** Every action, later sources shadowing earlier ones by id. */
	actions(): VimActionDef[] {
		return [...this.byId().values()].map((entry) => entry.def);
	}

	get(id: string): VimActionDef | undefined {
		return this.byId().get(id)?.def;
	}

	has(id: string): boolean {
		return this.byId().has(id);
	}

	sourceOf(id: string): ActionSource | undefined {
		return this.byId().get(id)?.source;
	}

	/**
	 * Every binding, in source order.
	 *
	 * An action's `defaultKeys` are folded in here rather than handled
	 * separately, so downstream sees one list and one shape.
	 */
	bindings(): SourcedBinding[] {
		const all: SourcedBinding[] = [];
		for (const [source, contribution] of this.contributions) {
			for (const action of contribution.actions ?? []) {
				for (const binding of action.defaultKeys ?? []) {
					all.push({
						keys: binding.keys,
						contexts: binding.contexts,
						target: { kind: "action", id: action.id, actionKind: action.kind },
						source,
					});
				}
			}
			for (const binding of contribution.bindings ?? []) {
				all.push({ ...binding, source });
			}
		}
		return all;
	}

	/** Coalesces change notifications from a batch of edits into one. */
	batch<T>(fn: () => T): T {
		const wasSuppressed = this.suppressed;
		this.suppressed = true;
		try {
			return fn();
		} finally {
			this.suppressed = wasSuppressed;
			if (!wasSuppressed && this.dirty) {
				this.dirty = false;
				this.notify();
			}
		}
	}

	/** Fires whenever contributions change, so surfaces can re-sync. */
	onChange(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	private byId(): Map<string, { def: VimActionDef; source: ActionSource }> {
		const byId = new Map<string, { def: VimActionDef; source: ActionSource }>();
		for (const [source, contribution] of this.contributions) {
			for (const def of contribution.actions ?? []) {
				byId.set(def.id, { def, source });
			}
		}
		return byId;
	}

	private notify(): void {
		if (this.suppressed) {
			this.dirty = true;
			return;
		}
		// Copy first: a listener may unsubscribe while we are iterating.
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
}
