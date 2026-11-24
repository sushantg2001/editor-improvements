import { charKey, type Key, MOD_ALT, MOD_CMD, MOD_CTRL, MOD_SHIFT, namedKey } from "./parse";

/** The fields of a `KeyboardEvent` the notation reads. */
export type KeyEvent = Pick<KeyboardEvent, "key" | "code" | "keyCode" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "isComposing" | "getModifierState">;

const NAMED: Record<string, string> = {
	Enter: "CR", Escape: "Esc", Tab: "Tab", Backspace: "BS", Delete: "Del", ArrowUp: "Up", ArrowDown: "Down",
	ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert",
};
for (let n = 1; n <= 24; n++) NAMED[`F${n}`] = `F${n}`;

const IGNORED = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock", "ScrollLock", "Fn", "OS", "Dead", "Process", "Unidentified"]);

/** Converts an event to a key, or null for one the router must leave alone. */
export function fromEvent(event: KeyEvent, mac = false): Key | null {
	if (event.isComposing || event.keyCode === 229 || IGNORED.has(event.key)) return null;
	let mods = 0;
	if (event.ctrlKey) mods |= MOD_CTRL;
	if (event.altKey) mods |= MOD_ALT;
	if (event.metaKey) mods |= MOD_CMD;
	if (event.shiftKey) mods |= MOD_SHIFT;

	const named = NAMED[event.key];
	if (named) return namedKey(mods, named);

	if ([...event.key].length === 1) {
		// AltGr, and Option on macOS, type a character rather than make a chord.
		if (event.getModifierState("AltGraph")) return charKey(0, event.key);
		if (mac && mods === MOD_ALT) return charKey(0, event.key);
		if (mac && mods === (MOD_ALT | MOD_SHIFT)) return charKey(0, event.key);
		return charKey(mods, event.key);
	}

	if (mods & (MOD_CTRL | MOD_ALT)) {
		const letter = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase() ?? /^Digit(\d)$/.exec(event.code)?.[1];
		if (letter) return charKey(mods, letter);
	}
	return null;
}
