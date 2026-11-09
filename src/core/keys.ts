/**
 * Vim key notation, checked well enough to catch typos.
 *
 * CodeMirror's vim treats an unrecognised `<Name>` as the literal characters
 * `<`, `N`, `a`, `m`, `e`, `>`, so a misspelt `<Escape>` maps nothing useful
 * and raises no error. Checking the notation up front is the only place the
 * mistake can be reported.
 */

const NAMED_KEYS = new Set([
	"esc",
	"cr",
	"enter",
	"return",
	"space",
	"bs",
	"tab",
	"del",
	"delete",
	"insert",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	"lt",
	"gt",
	"bar",
	"bslash",
	"nul",
	"leader",
]);

const FUNCTION_KEY = /^f(?:[1-9]|1[0-2])$/;
const MODIFIED = /^([CSAMD])-(.+)$/i;

function isKnownSpecial(name: string): boolean {
	const lower = name.toLowerCase();
	if (NAMED_KEYS.has(lower) || FUNCTION_KEY.test(lower)) {
		return true;
	}
	const modified = MODIFIED.exec(name);
	if (!modified?.[2]) {
		return false;
	}
	const rest = modified[2];
	// `<C-x>`, `<C-S-x>`, `<C-Space>`, `<C-'>`: a single character or a name.
	return [...rest].length === 1 || isKnownSpecial(rest);
}

/**
 * Splits `keys` into vim key tokens: `<...>` specials stay whole, everything
 * else is one character per token. A `<` with no closing `>` is a literal.
 */
export function tokenizeKeys(keys: string): string[] {
	const tokens: string[] = [];
	let index = 0;
	while (index < keys.length) {
		if (keys[index] === "<") {
			const close = keys.indexOf(">", index + 1);
			const body = close === -1 ? "" : keys.slice(index + 1, close);
			if (close !== -1 && /^[A-Za-z0-9'"`;,./\\\-[\]]+$/.test(body) && body.length > 1) {
				tokens.push(keys.slice(index, close + 1));
				index = close + 1;
				continue;
			}
		}
		const char = String.fromCodePoint(keys.codePointAt(index) ?? 0);
		tokens.push(char);
		index += char.length;
	}
	return tokens;
}

/**
 * Returns a human-readable problem with `keys`, or null when it is fine.
 *
 * Only the notation is judged. Whether a sequence means anything in vim is
 * vim's business.
 */
export function describeKeysProblem(keys: string): string | null {
	if (keys.length === 0) {
		return "the key sequence is empty";
	}
	if (keys.trim().length === 0 && keys !== " ") {
		return "the key sequence is only whitespace";
	}
	for (const token of tokenizeKeys(keys)) {
		if (token.length > 1 && token.startsWith("<") && !isKnownSpecial(token.slice(1, -1))) {
			return `${token} is not a vim key name`;
		}
	}
	return null;
}

/** Vim names for characters the addon only knows as the characters themselves. */
const CHARACTER_NAMES: Record<string, string> = { lt: "<", bar: "|", bslash: "\\" };

/** The addon's spelling of each key name, by lower-case alias. */
const KEY_NAMES: Record<string, string> = {
	space: "Space",
	cr: "CR",
	enter: "CR",
	return: "CR",
	esc: "Esc",
	escape: "Esc",
	tab: "Tab",
	bs: "BS",
	backspace: "BS",
	del: "Del",
	delete: "Del",
	ins: "Ins",
	insert: "Ins",
	left: "Left",
	right: "Right",
	up: "Up",
	down: "Down",
	home: "Home",
	end: "End",
	pageup: "PageUp",
	pagedown: "PageDown",
};

/** The order in which the addon writes modifiers: <C-A-M-S-x>. */
const MODIFIER_ORDER = ["C", "A", "M", "S"];

/** `<c-H>` -> `<C-h>`, `<Enter>` -> `<CR>`, `<lt>` -> `<`; anything unrecognised is returned as it was. */
function canonicalToken(token: string): string {
	let rest = token.slice(1, -1);
	const modifiers: string[] = [];
	while (/^[CSAMcsam]-./.test(rest)) {
		modifiers.push(rest.charAt(0).toUpperCase());
		rest = rest.slice(2);
	}
	const lower = rest.toLowerCase();

	if (modifiers.length === 0 && CHARACTER_NAMES[lower] !== undefined) {
		return CHARACTER_NAMES[lower];
	}
	let name: string;
	if (KEY_NAMES[lower] !== undefined) {
		name = KEY_NAMES[lower];
	} else if (/^f(?:[1-9]|1[0-2])$/.test(lower)) {
		name = lower.toUpperCase();
	} else if ([...rest].length === 1) {
		// A letter keeps its case only when shift is part of the key.
		name = modifiers.includes("S") ? rest : rest.toLowerCase();
	} else {
		return token;
	}
	if (modifiers.length === 0) {
		return `<${name}>`;
	}
	const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
	return `<${ordered.join("-")}-${name}>`;
}

/**
 * Rewrites key notation into the spellings the Vim addon actually matches.
 *
 * The addon turns a keyboard event into a name before looking for a mapping:
 * a space becomes `<Space>`, Enter becomes `<CR>`, Ctrl-H becomes `<C-h>`. A
 * plain remap, which is what `nmap("H", "^")` makes, is compared against that
 * name as written, and any other spelling is dead without an error: `<cr>`,
 * `<Enter>`, `<esc>`, `<c-h>`, `<C-H>`, `<M-j>` written as `<a-j>`, `<lt>`,
 * `<Bar>`, `<Bslash>`, `<up>`, and a literal space, tab or newline.
 *
 * `literalSpace` is for the keys a mapping listens for. In what a mapping
 * types, a space may belong to an ex command, such as `:s/a b/c/`, so it stays.
 */
export function normalizeKeys(keys: string, options: { literalSpace: boolean }): string {
	return tokenizeKeys(keys)
		.map((token) => {
			if (token.length > 1 && token.startsWith("<")) {
				return canonicalToken(token);
			}
			if (options.literalSpace) {
				if (token === " ") {
					return "<Space>";
				}
				if (token === "\t") {
					return "<Tab>";
				}
				if (token === "\n" || token === "\r") {
					return "<CR>";
				}
			}
			return token;
		})
		.join("");
}
