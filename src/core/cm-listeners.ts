import type { CodeMirrorShim } from "../types";

type Handler = (...args: unknown[]) => void;

/**
 * Attaches one handler per CodeMirror instance for a given event.
 *
 * CodeMirror events live on each editor, not on the app, so handlers have to be
 * re-attached as the active editor changes. The naive version — calling
 * `Component.register()` per attach — grows an unbounded array of closures, one
 * for every editor opened in the session, each holding its editor alive. This
 * keeps a single collection instead, sweeping out editors whose DOM has gone
 * away so it stays bounded by the number of *live* editors.
 */
export class CmListeners {
	private readonly entries = new Map<CodeMirrorShim, Handler>();

	constructor(
		private readonly event: string,
		private readonly factory: (cm: CodeMirrorShim) => Handler,
	) {}

	/** Attaches to `cm` if not already attached. Returns true if it attached. */
	attach(cm: CodeMirrorShim): boolean {
		this.prune();
		if (this.entries.has(cm)) {
			return false;
		}
		const handler = this.factory(cm);
		cm.on(this.event, handler);
		this.entries.set(cm, handler);
		return true;
	}

	detachAll(): void {
		for (const [cm, handler] of this.entries) {
			cm.off(this.event, handler);
		}
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private prune(): void {
		for (const [cm, handler] of this.entries) {
			if (!isLive(cm)) {
				cm.off(this.event, handler);
				this.entries.delete(cm);
			}
		}
	}
}

/** An editor whose input field has left the document is gone for good. */
function isLive(cm: CodeMirrorShim): boolean {
	try {
		return cm.getInputField()?.isConnected ?? false;
	} catch {
		return false;
	}
}
