// One notation for keys, following Neovim: `a`, `<CR>`, `<C-c>`, `<leader>x`.

/** One canonical key, such as `a`, `<CR>` or `<C-S-a>`. */
export type Key = string;
export type KeySeq = Key[];

/** An ex command a right-hand side runs with `<Cmd>...<CR>`. */
export interface ExStep {
	ex: string;
}

/** What a right-hand side sends: keys, and the ex commands of `<Cmd>`, in order. */
export type Rhs = (Key | ExStep)[];

/** Hears each `<Name>` that is not a key and is read as text. */
export type UnknownName = (token: string) => void;

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
	lt: "lt", bslash: "Bslash", bar: "Bar", plug: "Plug",
};
for (let n = 1; n <= 24; n++) NAMES[`f${n}`] = `F${n}`;

/** Names that are not keys and only a right-hand side can use. */
type Pseudo = "Nop" | "Ignore" | "Cmd";
const PSEUDO: Record<string, Pseudo> = { nop: "Nop", ignore: "Ignore", cmd: "Cmd" };

type Token = Key | { pseudo: Pseudo; column: number };

/** Named keys that stand for a character inside `<Cmd>...<CR>`. */
const KEY_TEXT: Record<string, string> = { "<Space>": " ", "<lt>": "<", "<Bslash>": "\\", "<Bar>": "|" };

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

/** What `<token>` stands for, or null when it is text. */
function named(token: string, column: number, leader: string): Token[] | null {
	const lower = token.toLowerCase();
	if (lower === "leader") return parseKeys(leader);
	const pseudo = PSEUDO[lower];
	if (pseudo) return [{ pseudo, column }];
	const key = parseToken(token, column);
	return key === null ? null : [key];
}

function scan(text: string, leader: string, unknown?: UnknownName): Token[] {
	const tokens: Token[] = [];
	const chars = [...text];
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] ?? "";
		if (char === "<") {
			const end = chars.indexOf(">", i + 2);
			if (end > 0) {
				const token = chars.slice(i + 1, end).join("");
				const found = named(token, i + 1, leader);
				if (found) {
					tokens.push(...found);
					i = end;
					continue;
				}
				// As in Neovim, a `<Name>` that is not a key is text. It is usually a mistake, so it is reported.
				if (/^[a-z][\w-]+$/i.test(token)) unknown?.(`<${token}>`);
			}
		}
		tokens.push(charKey(0, char));
	}
	return tokens;
}

/** Parses keys in the notation. `<leader>` becomes the keys of `leader` now. */
export function parseKeys(text: string, leader = "\\", unknown?: UnknownName): KeySeq {
	return scan(text, leader, unknown).map((token) => {
		if (typeof token === "string") return token;
		throw new NotationError(`<${token.pseudo}> can only be on the right-hand side`, token.column);
	});
}

/** The text a key stands for inside `<Cmd>...<CR>`, or null for a key that is not text. */
function keyText(key: Key): string | null {
	if ([...key].length === 1) return key;
	return KEY_TEXT[key] ?? null;
}

/** Parses a right-hand side. `<Nop>` and `<Ignore>` send nothing, and `<Cmd>...<CR>` runs an ex command. */
export function parseRhs(text: string, leader = "\\", unknown?: UnknownName): Rhs {
	const tokens = scan(text, leader, unknown);
	const rhs: Rhs = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] ?? "";
		if (typeof token === "string") {
			rhs.push(token);
			continue;
		}
		if (token.pseudo !== "Cmd") continue;
		let command = "";
		for (i++; tokens[i] !== "<CR>"; i++) {
			const part = tokens[i];
			if (part === undefined) throw new NotationError("<Cmd> must end with <CR>", token.column);
			const partText = typeof part === "string" ? keyText(part) : null;
			if (partText === null) throw new NotationError(`Only text can go between <Cmd> and <CR>, not ${typeof part === "string" ? part : `<${part.pseudo}>`}`, token.column);
			command += partText;
		}
		rhs.push({ ex: command });
	}
	return rhs;
}

export function keysToString(keys: KeySeq): string {
	return keys.join("");
}

/** True for a key held with Ctrl, Alt or Cmd. */
export function isChord(key: Key): boolean {
	return /^<(?:[CAD]-)/.test(key);
}
