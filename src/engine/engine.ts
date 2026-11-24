import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Key, KeySeq, Rhs } from "../notation/parse";

export type EngineMode = "n" | "i" | "v" | "x" | "o" | "R" | "c";

/** Modes a key-to-key mapping can be defined in. */
export type MapMode = "n" | "i" | "v" | "x" | "o";

export interface EngineMap {
	mode: MapMode;
	lhs: KeySeq;
	rhs: Rhs;
	noremap: boolean;
}

/** Everything one config load gives the engine. */
export interface EngineGeneration {
	maps: EngineMap[];
	options: [string, unknown][];
	/** Ex commands from `vim.cmd`, run once when the generation is applied. */
	commands: string[];
}

export interface Engine {
	/** The editor extension. It is registered only while the plugin is active. */
	extension(): Extension;
	release(): void;
	isAttached(view: EditorView): boolean;
	mode(view: EditorView): EngineMode;
	/** Runs keys as if typed, without applying user mappings to them, and the ex commands between them. Throws when a command fails. */
	feedKeys(view: EditorView, rhs: Rhs): void;
	/** Delivers one key held back by the router, as if it had just been typed. */
	deliverKey(view: EditorView, key: Key): void;
	/** Runs an ex command. Returns an error message, or null. */
	runEx(view: EditorView | null, command: string): string | null;
	isOption(name: string): boolean;
	getOption(name: string): unknown;
	/** Replaces every mapping and option of the last generation. Returns the errors. */
	apply(generation: EngineGeneration): string[];
	/** Removes every mapping and option set through `apply`. */
	clear(): void;
}
