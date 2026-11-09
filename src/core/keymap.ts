import type { ActionRegistry, BindingTarget, SourcedBinding, UnmapSpec } from "./registry";
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
 * Which built-in bindings have been removed from the Vim API this session.
 *
 * `Vim.unmap` removes the first entry that matches, and after the built-in one
 * is gone that would be somebody else's. So each is removed once. The record
 * has to live as long as the removal does, which is as long as the Vim API
 * does: until Obsidian restarts. A ledger would not do, nor anything in this
 * file's own scope, because turning the plugin off and on creates both anew
 * while the keymap carries on without the built-in. It hangs off the Vim
 * object itself, under a key shared by every copy of the plugin.
 *
 * Unlike our own bindings, a removed built-in cannot be handed back: vim
 * exposes no way to restore it.
 */
const RELEASED = Symbol.for("vim-tools.released-built-ins");

interface Released {
	/** `mode:keys` of each removal asked for. */
	slots: Set<string>;
	/** Keys whose mode-less built-in has been removed. */
	everywhere: Set<string>;
}

/**
 * Keys that no key press can ever match: they start with a control character.
 */
const PLACEHOLDER_KEYS = "\u0001vim-tools-removed-built-in";

/**
 * Makes up for a removed built-in, which would otherwise break every plain
 * remap.
 *
 * A non-recursive mapping (`nnoremap` and its kin) is resolved against the
 * built-in keys only, which the addon finds by counting back from the end of
 * its keymap by the number of built-ins it started with. Take one out and the
 * count is one too long: it begins a place too early, among our own mappings,
 * and with more removals than mappings it begins before the start of the list
 * and every use of a plain remap fails with a TypeError. A mapping that cannot
 * match anything takes the removed one's place, so the count comes out right
 * and the search starts where the built-ins do.
 */
function keepBuiltInBoundary(vim: VimApi): void {
	vim.mapCommand(PLACEHOLDER_KEYS, "action", "vimToolsRemovedBuiltIn", {}, { context: "normal" });
}

function releasedBy(vim: VimApi): Released {
	const holder = vim as unknown as Record<symbol, Released | undefined>;
	return (holder[RELEASED] ??= { slots: new Set(), everywhere: new Set() });
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
	/**
	 * Replaces every binding we own with `bindings`, after clearing the built-in
	 * bindings in `unmaps` out of the way.
	 *
	 * The order matters. A key such as `S` must stop meaning "change line"
	 * before `Sl` can be reached, and removing it after mapping could take out
	 * one of our own bindings instead.
	 */
	apply(
		vim: VimApi,
		dispatcher: VimDispatcher,
		bindings: ResolvedBinding[],
		unmaps: UnmapSpec[] = [],
	): void {
		this.clear(vim);
		this.release(vim, unmaps);
		for (const binding of bindings) {
			if (!this.applyOne(vim, dispatcher, binding)) {
				continue;
			}
			this.applied.push({ keys: binding.keys, context: binding.context });
		}
	}

	private release(vim: VimApi, unmaps: UnmapSpec[]): void {
		const released = releasedBy(vim);
		for (const { keys, contexts } of unmaps) {
			for (const context of contexts ?? [undefined]) {
				const slot = `${context ?? "all"}:${keys}`;
				if (released.slots.has(slot)) {
					continue;
				}
				released.slots.add(slot);
				// Vim matches the context exactly. `S` has one entry per mode, but
				// a key such as <Space> has a single entry with no context at all,
				// which asking for "normal" never finds. Fall back to that entry,
				// once: it covers every mode, so it is gone for all of them.
				let removed = vim.unmap(keys, context);
				if (!removed && context !== undefined && !released.everywhere.has(keys)) {
					removed = vim.unmap(keys, undefined);
					if (removed) {
						released.everywhere.add(keys);
					}
				}
				if (removed) {
					keepBuiltInBoundary(vim);
				}
			}
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
			// Only a command flagged as an edit is remembered for `.` to repeat.
			...(dispatcher.isEdit(binding.target.id) ? { isEdit: true } : {}),
		});
		return true;
	}
}
