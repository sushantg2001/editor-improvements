import type { ActionRegistry, BindingTarget, SourcedBinding } from "./registry";
import type { VimDispatcher } from "./dispatch";
import type { ActionSource, BindingContext, VimApi } from "../types";

export interface ResolvedBinding {
	keys: string;
	context: BindingContext;
	target: BindingTarget;
	source: ActionSource;
}

export interface KeymapConflict {
	keys: string;
	context: BindingContext;
	/** Distinct things claiming this key, e.g. `action:selectAll`, `keys:^`. */
	claimants: string[];
	/** Where those claims came from. */
	sources: ActionSource[];
	/** The claim that won — the last applied. */
	winner: string;
}

export interface KeymapResolution {
	bindings: ResolvedBinding[];
	conflicts: KeymapConflict[];
}

function slot(keys: string, context: BindingContext): string {
	return `${context}:${keys}`;
}

/** A stable description of what a key resolves to, for conflict reporting. */
export function describeTarget(target: BindingTarget): string {
	return target.kind === "action" ? `action:${target.id}` : `keys:${target.rhs}`;
}

/**
 * Flattens the registry's bindings into one per key+context.
 *
 * Later sources win, which is what makes a script able to override a builtin.
 * Shadowed claims are reported rather than silently dropped.
 */
export function resolveBindings(registry: ActionRegistry): KeymapResolution {
	const winners = new Map<string, ResolvedBinding>();
	const claimants = new Map<string, ResolvedBinding[]>();

	for (const binding of registry.bindings()) {
		for (const context of binding.contexts) {
			const resolved = toResolved(binding, context);
			const key = slot(resolved.keys, context);
			winners.set(key, resolved);
			claimants.set(key, [...(claimants.get(key) ?? []), resolved]);
		}
	}

	const conflicts: KeymapConflict[] = [];
	for (const [key, claims] of claimants) {
		const winner = winners.get(key);
		// Only a genuine disagreement counts. Re-stating the *same* binding —
		// a script reloaded, or a default restated — is not a conflict.
		const distinct = [...new Set(claims.map((c) => describeTarget(c.target)))];
		if (winner && distinct.length > 1) {
			conflicts.push({
				keys: winner.keys,
				context: winner.context,
				claimants: distinct,
				sources: [...new Set(claims.map((c) => c.source))],
				winner: describeTarget(winner.target),
			});
		}
	}

	return { bindings: withOperatorPending([...winners.values()]), conflicts };
}

function toResolved(binding: SourcedBinding, context: BindingContext): ResolvedBinding {
	return {
		keys: binding.keys,
		context,
		target: binding.target,
		source: binding.source,
	};
}

/**
 * Mirrors every normal-mode motion into the `operatorPending` context.
 *
 * CodeMirror's `commandMatches` rewrites the context to `"operatorPending"`
 * whenever an operator is waiting for a motion, and then skips any command
 * whose own context differs. A motion mapped only as `normal` is therefore
 * invisible to `d`, `y` and `c` — it works alone and silently does nothing
 * when composed. Since composing with operators is the entire reason to
 * register something as a motion rather than a command, the extra binding is
 * derived rather than left to callers to remember.
 */
function withOperatorPending(bindings: ResolvedBinding[]): ResolvedBinding[] {
	const existing = new Set(bindings.map((b) => slot(b.keys, b.context)));
	const derived: ResolvedBinding[] = [];
	for (const binding of bindings) {
		if (
			binding.context === "normal" &&
			binding.target.kind === "action" &&
			binding.target.actionKind === "motion" &&
			!existing.has(slot(binding.keys, "operatorPending"))
		) {
			derived.push({ ...binding, context: "operatorPending" });
		}
	}
	return [...bindings, ...derived];
}

/**
 * Tracks every key we hand to CodeMirror's vim so we can hand it back.
 *
 * `mapCommand` has no removal API, but `Vim.unmap(keys, context)` splices the
 * first matching entry out of `defaultKeymap`, and `_mapCommand` *unshifts*, so
 * the most recently mapped entry is the one removed. Recording what we mapped
 * therefore lets us unmap exactly our own bindings and leave anyone else's —
 * and to do it on `onunload`, which is what vimrc-support never managed.
 */
export class MappingLedger {
	private applied: { keys: string; context: BindingContext }[] = [];

	/** Replaces every binding we own with `bindings`. */
	apply(vim: VimApi, dispatcher: VimDispatcher, bindings: ResolvedBinding[]): void {
		this.clear(vim);
		for (const binding of bindings) {
			if (!this.applyOne(vim, dispatcher, binding)) {
				continue;
			}
			this.applied.push({ keys: binding.keys, context: binding.context });
		}
	}

	/** Unmaps everything we applied, most recent first. */
	clear(vim: VimApi): void {
		for (const entry of [...this.applied].reverse()) {
			vim.unmap(entry.keys, entry.context);
		}
		this.applied = [];
	}

	get size(): number {
		return this.applied.length;
	}

	private applyOne(
		vim: VimApi,
		dispatcher: VimDispatcher,
		binding: ResolvedBinding,
	): boolean {
		if (binding.target.kind === "keys") {
			const { rhs, recursive } = binding.target;
			if (recursive) {
				vim.map(binding.keys, rhs, binding.context);
			} else {
				vim.noremap(binding.keys, rhs, binding.context);
			}
			return true;
		}
		const name = dispatcher.ensure(vim, binding.target.id, binding.target.actionKind);
		if (!name) {
			return false;
		}
		vim.mapCommand(binding.keys, binding.target.actionKind, name, {}, {
			context: binding.context,
		});
		return true;
	}
}
