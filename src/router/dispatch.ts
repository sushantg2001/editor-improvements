import type { ActionRegistry, ActionResult, Classified } from "../actions/registry";
import { log } from "../diagnostics/log";
import type { Engine } from "../engine/engine";
import { fromEvent } from "../notation/event";
import { isChord, type Key, type KeySeq, keysToString } from "../notation/parse";
import { classify, contextChain, type ClassifyDeps } from "./classify";
import { PANIC_CHORD, type Router, type RouterMapping } from "./router";
import { compileTries, lookup, type Tries } from "./trie";

/** The event code of the self-test's synthetic key. */
export const PROBE_CODE = "EditorImprovementsProbe";

export interface DispatchDeps extends ClassifyDeps {
	engine: Engine;
	actions: Pick<ActionRegistry, "run">;
	mac: boolean;
	onPanic(): void;
	onError(): void;
	onChange(): void;
}

interface Held {
	keys: KeySeq;
	classified: Classified;
	mapping: RouterMapping | null;
	timer: number | null;
}

/** Decides what every key does. Returns `false` to cancel it, `undefined` to pass it on. */
export class KeyRouter implements Router {
	private tries: Tries = new Map();
	private timeoutlen = 1000;
	private strictkeys = true;
	private safe = false;
	private held: Held | null = null;
	/** Set when the self-test's synthetic key arrives. */
	probeSeen = false;

	constructor(private readonly deps: DispatchDeps) {}

	get pending(): KeySeq | null {
		return this.held?.keys ?? null;
	}

	setKeymap(mappings: RouterMapping[], timeoutlen: number, strictkeys: boolean): void {
		this.clearHeld();
		this.tries = compileTries(mappings);
		this.timeoutlen = timeoutlen;
		this.strictkeys = strictkeys;
	}

	setSafeMode(on: boolean): void {
		this.safe = on;
		this.clearHeld();
	}

	/** The scope handler. Nothing may escape it, or the keyboard could stop working. */
	readonly handle = (event: KeyboardEvent): false | undefined => {
		try {
			if (event.code === PROBE_CODE) {
				this.probeSeen = true;
				return false;
			}
			const key = fromEvent(event, this.deps.mac);
			if (key === null) return undefined;
			if (key === PANIC_CHORD) {
				if (!event.repeat) this.deps.onPanic();
				return false;
			}
			if (this.safe) return undefined;
			const result = this.process(key, classify(event, this.deps), event);
			this.deps.onChange();
			return result;
		} catch (error) {
			log("error", "router", `${event.key}: ${error instanceof Error ? error.message : String(error)}`);
			this.clearHeld();
			this.deps.onError();
			return undefined;
		}
	};

	private clearHeld(): void {
		if (this.held?.timer != null) window.clearTimeout(this.held.timer);
		const had = this.held !== null;
		this.held = null;
		if (had) this.deps.onChange();
	}

	private sameTarget(a: Classified, b: Classified): boolean {
		return a.context === b.context && a.win === b.win && a.editorView === b.editorView && a.mode === b.mode;
	}

	private process(key: Key, classified: Classified, event: KeyboardEvent): false | undefined {
		if (this.held && !this.sameTarget(this.held.classified, classified)) this.clearHeld();
		const chain = contextChain(classified);
		const keys = this.held ? [...this.held.keys, key] : [key];
		const found = lookup(this.tries, chain, keys);

		if (found.mapping && !found.prefix) {
			this.clearHeld();
			return this.runMapping(found.mapping, key, classified, event);
		}
		if (found.prefix) {
			this.hold(keys, classified, found.mapping);
			return false;
		}
		if (this.held) return this.breakSequence(key, classified, event, chain);
		return this.fallThrough(key, classified);
	}

	private hold(keys: KeySeq, classified: Classified, mapping: RouterMapping | null): void {
		this.clearHeld();
		const held: Held = { keys, classified, mapping, timer: null };
		if (mapping) {
			held.timer = window.setTimeout(() => {
				if (this.held !== held) return;
				this.clearHeld();
				this.run(mapping, classified, null);
			}, this.timeoutlen);
		}
		this.held = held;
		this.deps.onChange();
	}

	private run(mapping: RouterMapping, classified: Classified, event: KeyboardEvent | null): ActionResult {
		const result = this.deps.actions.run(mapping.action, { classified, event, key: keysToString(mapping.keys) });
		if (result === "error") this.deps.onError();
		return result;
	}

	private runMapping(mapping: RouterMapping, key: Key, classified: Classified, event: KeyboardEvent): false | undefined {
		if (event.repeat && !mapping.repeatable) return false;
		const result = this.run(mapping, classified, event);
		if (result === "not-applicable" && mapping.keys.length === 1) return this.fallThrough(key, classified);
		return false;
	}

	/** A key broke the sequence: run the longest mapping held, then replay what is left. */
	private breakSequence(key: Key, classified: Classified, event: KeyboardEvent, chain: string[]): false | undefined {
		const queue = [...(this.held?.keys ?? []), key];
		this.clearHeld();
		while (queue.length > 0) {
			let length = queue.length;
			let mapping: RouterMapping | null = null;
			for (; length > 0; length--) {
				mapping = lookup(this.tries, chain, queue.slice(0, length)).mapping;
				if (mapping) break;
			}
			if (mapping) {
				queue.splice(0, length);
				this.run(mapping, classified, event);
				continue;
			}
			if (lookup(this.tries, chain, queue).prefix) {
				this.hold([...queue], classified, null);
				return false;
			}
			const next = queue.shift() as Key;
			// The last key is still the live event, so it can simply carry on.
			if (queue.length === 0) return this.fallThrough(next, classified);
			this.deliver(next, classified);
		}
		return false;
	}

	private deliver(key: Key, classified: Classified): void {
		if (classified.context === "editor" && classified.editorView) {
			this.deps.engine.deliverKey(classified.editorView, key);
		} else if (classified.context === "input" && [...key].length === 1) {
			classified.win.document.execCommand("insertText", false, key);
		}
	}

	private fallThrough(key: Key, classified: Classified): false | undefined {
		if (this.strictkeys && isChord(key)) {
			const { context, mode } = classified;
			if (context === "global" || context.startsWith("view:") || (context === "editor" && (mode === "i" || mode === "R"))) return false;
		}
		return undefined;
	}
}
