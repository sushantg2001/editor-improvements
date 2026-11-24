import type { KeySeq } from "../notation/parse";

/** One key sequence mapped to an action, in one context. */
export interface RouterMapping {
	context: string;
	keys: KeySeq;
	action: string;
	repeatable: boolean;
	desc?: string;
}

export interface Router {
	setKeymap(mappings: RouterMapping[], timeoutlen: number, strictkeys: boolean): void;
	setSafeMode(on: boolean): void;
	/** The keys held so far, for the status bar. */
	readonly pending: KeySeq | null;
}

/** The chord that always toggles safe mode. It cannot be remapped. */
export const PANIC_CHORD = "<C-A-S-F12>";
