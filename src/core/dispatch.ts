import { Notice } from "obsidian";
import type { App, EditorPosition } from "obsidian";

import type { ActionRegistry } from "./registry";
import type {
	CodeMirrorShim,
	VimActionArgs,
	VimActionKind,
	VimActionResult,
	VimApi,
	VimContext,
	VimContextBase,
} from "../types";

/** Prefix for every name we define on the vim side, to avoid collisions. */
const STUB_PREFIX = "vimTools_";

/**
 * The name of the vim-side stub for an action of a given kind.
 *
 * The kind is part of the name because vim keeps motions, operators and
 * actions in separate tables and cannot remove a name from any of them. An id
 * whose script is edited from `action` to `motion` needs a stub in the motion
 * table; reusing the old name would point the key at a table where it does not
 * exist.
 */
export function stubName(id: string, kind: VimActionKind): string {
	return `${STUB_PREFIX}${kind}_${id.replace(/[^A-Za-z0-9]/g, "_")}`;
}

interface MotionArgs {
	repeat?: number;
}

function hasEditor(ctx: VimContextBase): ctx is VimContext {
	return "cm" in ctx;
}

/**
 * Owns every `defineMotion` / `defineAction` / `defineOperator` call.
 *
 * CodeMirror's vim has no way to *un*define a name, so each id gets exactly one
 * stub, registered once and never removed. The stub resolves the action through
 * the registry on every invocation, which is what makes bodies hot-swappable:
 * reloading a script replaces the registry entry while the stub stays put. An
 * id whose action has gone away becomes an inert no-op rather than a crash.
 */
export class VimDispatcher {
	private readonly defined = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly registry: ActionRegistry,
		private readonly buildContext: (cm: CodeMirrorShim) => VimContext | null,
		private readonly getVim: () => VimApi | null,
	) {}

	/**
	 * Ensures a vim-side stub exists for `id` and returns its name, or null if
	 * the Vim API is unavailable.
	 */
	ensure(vim: VimApi, id: string, kind: VimActionKind): string | null {
		const name = stubName(id, kind);
		if (this.defined.has(name)) {
			return name;
		}
		switch (kind) {
			case "motion":
				vim.defineMotion(name, (...args: unknown[]) => this.runMotion(id, args));
				break;
			case "operator":
				vim.defineOperator(name, (...args: unknown[]) =>
					this.runOperator(id, args),
				);
				break;
			case "action":
				vim.defineAction(name, (...args: unknown[]) => {
					this.runAction(id, args);
				});
				break;
		}
		this.defined.add(name);
		return name;
	}

	/** Invokes an action outside vim — from an Obsidian command or the API. */
	invoke(id: string, cm: CodeMirrorShim | null, args?: Partial<VimActionArgs>): void {
		const def = this.registry.get(id);
		if (!def) {
			return;
		}
		const ctx = cm ? this.buildContext(cm) : null;
		if (!ctx && def.needsEditor !== false) {
			new Notice("Vim Tools: no active editor.");
			return;
		}
		// An action that opted out of needing an editor still runs when there
		// is none — it just gets the base context. Copy path is the reason:
		// it is useful precisely when focus is not in a note.
		this.execute(id, ctx ?? this.detachedContext(), { repeat: 1, ...args });
	}

	private detachedContext(): VimContextBase {
		return { app: this.app, mode: "normal" };
	}

	private runMotion(id: string, args: unknown[]): EditorPosition | undefined {
		const [cm, head, motionArgs] = args as [
			CodeMirrorShim,
			EditorPosition,
			MotionArgs | undefined,
		];
		const ctx = this.buildContext(cm);
		if (!ctx) {
			return head;
		}
		const result = this.execute(id, ctx, { repeat: motionArgs?.repeat ?? 1 });
		// Motions must be synchronous; anything else leaves the cursor put.
		return isPosition(result) ? result : head;
	}

	private runOperator(id: string, args: unknown[]): EditorPosition | undefined {
		const [cm, operatorArgs, ranges] = args as [
			CodeMirrorShim,
			MotionArgs | undefined,
			{ anchor: EditorPosition; head: EditorPosition }[] | undefined,
		];
		const ctx = this.buildContext(cm);
		if (!ctx) {
			return undefined;
		}
		const first = ranges?.[0];
		const result = this.execute(id, ctx, {
			repeat: operatorArgs?.repeat ?? 1,
			range: first ? { from: first.anchor, to: first.head } : undefined,
		});
		return isPosition(result) ? result : undefined;
	}

	private runAction(id: string, args: unknown[]): void {
		const [cm, actionArgs] = args as [CodeMirrorShim, MotionArgs | undefined];
		const ctx = this.buildContext(cm);
		if (!ctx) {
			return;
		}
		this.execute(id, ctx, { repeat: actionArgs?.repeat ?? 1 });
	}

	/**
	 * Runs an action, reporting failures against the source that registered it
	 * rather than letting them surface as an opaque CodeMirror error.
	 */
	private execute(
		id: string,
		ctx: VimContextBase,
		args: VimActionArgs,
	): VimActionResult {
		const def = this.registry.get(id);
		if (!def) {
			return undefined;
		}
		try {
			const result = def.run(ctx as VimContext, args);
			if (result instanceof Promise) {
				// Async actions still get their result mode, just later — the
				// mode switch has to wait for the edit it follows.
				result
					.then(() => this.applyResultMode(def.resultMode, ctx))
					.catch((error: unknown) => this.report(id, error));
				return undefined;
			}
			this.applyResultMode(def.resultMode, ctx);
			return result;
		} catch (error) {
			this.report(id, error);
			return undefined;
		}
	}

	private applyResultMode(
		resultMode: "insert" | "normal" | undefined,
		ctx: VimContextBase,
	): void {
		if (!resultMode || !hasEditor(ctx)) {
			return;
		}
		const vim = this.getVim();
		if (!vim) {
			return;
		}
		// Re-read the mode: an async action may have changed it since the
		// context was built.
		const mode = ctx.cm.state.vim?.mode;
		if (resultMode === "insert" && mode !== "insert") {
			vim.enterInsertMode(ctx.cm);
		} else if (resultMode === "normal" && mode === "visual") {
			vim.exitVisualMode(ctx.cm);
		}
	}

	private report(id: string, error: unknown): void {
		const source = this.registry.sourceOf(id) ?? "unknown";
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Vim Tools: "${id}" failed (${source})\n${message}`, 8000);
	}
}

function isPosition(value: VimActionResult): value is EditorPosition {
	return (
		typeof value === "object" &&
		value !== null &&
		"line" in value &&
		"ch" in value
	);
}
