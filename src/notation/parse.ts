// One notation for keys, following Neovim: `a`, `<CR>`, `<C-c>`, `<leader>x`.

/** One canonical key, such as `a`, `<CR>` or `<C-S-a>`. */
export type Key = string;
export type KeySeq = Key[];

export const MOD_CTRL = 1;
export const MOD_ALT = 2;
export const MOD_CMD = 4;
export const MOD_SHIFT = 8;

export class NotationError extends Error {
	constructor(message: string, readonly column: number) {
		super(message);
	}
}

const NAMES: Record<string, string> = {
	cr: "CR", enter: "CR", return: "CR", esc: "Esc", escape: "Esc", tab: "Tab", bs: "BS", backspace: "BS",
	del: "Del", delete: "Del", space: "Space", up: "Up", down: "Down", left: "Left", right: "Right",
	home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown", insert: "Insert",
	lt: "lt", bslash: "Bslash", bar: "Bar",
};
for (let n = 1; n <= 12; n++) NAMES[`f${n}`] = `F${n}`;

/** Characters that have a named form, so a key has one spelling only. */
const CHAR_NAMES: Record<string, string> = { " ": "Space", "<": "lt", "\\": "Bslash", "|": "Bar" };

function prefix(mods: number): string {
	return `${mods & MOD_CTRL ? "C-" : ""}${mods & MOD_ALT ? "A-" : ""}${mods & MOD_CMD ? "D-" : ""}${mods & MOD_SHIFT ? "S-" : ""}`;
}

/** Builds the canonical key for a named key, such as `CR`. */
export function namedKey(mods: number, name: string): Key {
	return `<${prefix(mods)}${name}>`;
}

/** Builds the canonical key for a printable character. Shift is part of the character. */
export function charKey(mods: number, char: string): Key {
	const named = CHAR_NAMES[char];
	if (named) return namedKey(mods & ~MOD_SHIFT, named);
	const lower = char.toLowerCase();
	const isLetter = lower !== char.toUpperCase();
	let all = mods;
	if (isLetter && char !== lower) all |= MOD_SHIFT;
	if (!isLetter) all &= ~MOD_SHIFT;
	if (all === 0) return char;
	if (all === MOD_SHIFT) return lower.toUpperCase();
	return `<${prefix(all)}${lower}>`;
}

function parseToken(token: string, column: number): Key | null {
	const match = /^((?:[cCaAmMdDsS]-)*)(.+)$/su.exec(token);
	if (!match) return null;
	const [, modText = "", name = ""] = match;
	let mods = 0;
	for (const letter of modText.replaceAll("-", "").toLowerCase()) {
		if (letter === "c") mods |= MOD_CTRL;
		else if (letter === "a" || letter === "m") mods |= MOD_ALT;
		else if (letter === "d") mods |= MOD_CMD;
		else mods |= MOD_SHIFT;
	}
	const known = NAMES[name.toLowerCase()];
	if (known) return namedKey(mods, known);
	if ([...name].length === 1) return modText ? charKey(mods, name) : null;
	if (modText) throw new NotationError(`Unknown key "${name}" in <${token}>`, column);
	return null;
}

/** Parses keys in the notation. `<leader>` becomes the keys of `leader` now. */
export function parseKeys(text: string, leader = "\\"): KeySeq {
	const keys: KeySeq = [];
	const chars = [...text];
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] ?? "";
		if (char === "<") {
			const end = chars.indexOf(">", i + 2);
			if (end > 0) {
				const token = chars.slice(i + 1, end).join("");
				if (token.toLowerCase() === "leader") {
					keys.push(...parseKeys(leader));
					i = end;
					continue;
				}
				const key = parseToken(token, i + 1);
				if (key !== null) {
					keys.push(key);
					i = end;
					continue;
				}
			}
		}
		keys.push(charKey(0, char));
	}
	return keys;
}

export function keysToString(keys: KeySeq): string {
	return keys.join("");
}

/** True for a key held with Ctrl, Alt or Cmd. */
export function isChord(key: Key): boolean {
	return /^<(?:[CAD]-)/.test(key);
}
