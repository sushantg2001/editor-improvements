import type { Key, KeySeq } from "./parse";

const SPECIAL: Record<string, string> = { "<lt>": "<", "<Bslash>": "\\", "<Bar>": "|", "<Insert>": "<Ins>" };

function keyToEngine(key: Key): string {
	const special = SPECIAL[key];
	if (special) return special;
	// The engine's `M-` is Cmd, which this plugin spells `D-`.
	return key.replace(/^<((?:[CA]-)*)D-/, "<$1M-").replace(/-Insert>$/, "-Ins>");
}

/** Converts keys to the engine's notation. Nothing outside the engine adapter sees it. */
export function toEngine(keys: KeySeq): string {
	return keys.map(keyToEngine).join("");
}
