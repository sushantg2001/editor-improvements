import type { Key, KeySeq, Rhs } from "./parse";

const SPECIAL: Record<string, string> = { "<lt>": "<", "<Bslash>": "\\", "<Bar>": "|", "<Insert>": "<Ins>" };

function keyToEngine(key: Key): string {
	const special = SPECIAL[key];
	if (special) return special;
	// The engine's `M-` is Cmd, which this plugin spells `D-`.
	return key.replace(/^<((?:[CA]-)*)D-/, "<$1M-").replace(/-Insert>$/, "-Ins>");
}

/** Converts keys the engine compares as typed, such as a left-hand side, to its notation. Nothing outside the engine adapter sees it. */
export function toEngine(keys: KeySeq): string {
	return keys.map(keyToEngine).join("");
}

/**
 * Converts a right-hand side to the string the engine reads one key at a time.
 * `<lt>` stays `<lt>`: the engine would read a bare `<` and the `word>` after it as one key.
 * `exKey` names the key that runs an ex command.
 */
export function rhsToEngine(rhs: Rhs, exKey: (command: string) => string): string {
	return rhs.map((step) => (typeof step !== "string" ? exKey(step.ex) : step === "<lt>" ? step : keyToEngine(step))).join("");
}
