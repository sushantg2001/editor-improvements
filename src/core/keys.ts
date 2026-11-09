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
