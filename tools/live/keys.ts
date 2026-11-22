// Turns the key notation used in checks, such as `i`, `<Esc>` or `<C-A-k>`,
// into the fields of a DevTools Protocol key event.

/** Modifier bits as the DevTools Protocol counts them. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

export interface KeyParams {
	key: string;
	code: string;
	vk: number;
	mods: number;
	text?: string;
}

const NAMED: Record<string, { key: string; code: string; vk: number; text?: string }> = {
	Esc: { key: "Escape", code: "Escape", vk: 27 },
	CR: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
	Tab: { key: "Tab", code: "Tab", vk: 9 },
	BS: { key: "Backspace", code: "Backspace", vk: 8 },
	Space: { key: " ", code: "Space", vk: 32, text: " " },
	Up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
	Down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
	Left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
	Right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
	F12: { key: "F12", code: "F12", vk: 123 },
};

const MODIFIERS: Record<string, number> = { C: MOD.ctrl, A: MOD.alt, M: MOD.meta, S: MOD.shift };

function character(char: string, mods: number): KeyParams {
	const lower = char.toLowerCase();
	const upper = char.toUpperCase();
	let code: string;
	if (/^[a-z]$/.test(lower)) code = `Key${upper}`;
	else if (/^[0-9]$/.test(char)) code = `Digit${char}`;
	else throw new Error(`no key for "${char}"`);
	const shifted = char !== lower || (mods & MOD.shift) !== 0;
	const allMods = mods | (shifted && char !== lower ? MOD.shift : 0);
	const key = shifted ? upper : lower;
	const chord = (allMods & (MOD.ctrl | MOD.alt | MOD.meta)) !== 0;
	const params: KeyParams = { key, code, vk: upper.charCodeAt(0), mods: allMods };
	if (!chord) params.text = key;
	return params;
}

/** Parses one key. Throws on a key the harness cannot press. */
export function parseKey(notation: string): KeyParams {
	if (!notation.startsWith("<")) {
		if (notation.length !== 1) throw new Error(`not one key: "${notation}"`);
		return character(notation, 0);
	}
	if (!notation.endsWith(">")) throw new Error(`unclosed key: "${notation}"`);
	const parts = notation.slice(1, -1).split("-");
	const name = parts.pop() ?? "";
	let mods = 0;
	for (const part of parts) {
		const bit = MODIFIERS[part];
		if (bit === undefined) throw new Error(`unknown modifier "${part}" in "${notation}"`);
		mods |= bit;
	}
	const named = NAMED[name];
	if (named) {
		const params: KeyParams = { key: named.key, code: named.code, vk: named.vk, mods };
		if (named.text !== undefined && (mods & (MOD.ctrl | MOD.alt | MOD.meta)) === 0) params.text = named.text;
		return params;
	}
	if (name.length !== 1) throw new Error(`unknown key "${name}" in "${notation}"`);
	return character(name, mods);
}
