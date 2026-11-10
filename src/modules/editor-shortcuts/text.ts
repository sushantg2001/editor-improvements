import { CharCategory, findClusterBreak } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";

/** Pure text helpers. Nothing here knows about editors or vim. */

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const LOWERCASE_ARTICLES = new Set(["the", "a", "an"]);

export function isWordChar(char: string): boolean {
	return char.length > 0 && WORD_CHAR.test(char);
}

/**
 * The offset on `line` at `column`, or at the line's end if it is shorter.
 *
 * A column counts UTF-16 units, so the same column on another line can fall
 * inside an emoji or between a letter and its accent. The cursor goes to the
 * start of that character instead, as it would if it had been moved there.
 */
export function offsetAtColumn(line: { from: number; text: string }, column: number): number {
	if (column >= line.text.length) {
		return line.from + line.text.length;
	}
	return line.from + findClusterBreak(line.text, column + 1, false);
}

/** The word touching `column` in `text`, as `[from, to)` columns. Empty when none. */
export function wordRangeAt(text: string, column: number): [number, number] {
	let start = column;
	let end = column;
	while (start > 0 && isWordChar(text.charAt(start - 1))) {
		start--;
	}
	while (end < text.length && isWordChar(text.charAt(end))) {
		end++;
	}
	return [start, end];
}

export function leadingWhitespace(text: string): string {
	return /^\s*/.exec(text)?.[0] ?? "";
}

export function toTitleCase(text: string): string {
	// The capture group keeps whichever whitespace separated the words.
	return text
		.split(/(\s+)/)
		.map((word, index, all) => {
			if (index > 0 && index < all.length - 1 && LOWERCASE_ARTICLES.has(word.toLowerCase())) {
				return word.toLowerCase();
			}
			return word.charAt(0).toUpperCase() + word.substring(1).toLowerCase();
		})
		.join("");
}

export type CaseTransform = "upper" | "lower" | "title" | "next";

/** UPPER -> lower -> Title -> UPPER; anything else goes to UPPER. */
export function nextCase(text: string): string {
	switch (text) {
		case text.toUpperCase():
			return text.toLowerCase();
		case text.toLowerCase():
			return toTitleCase(text);
		case toTitleCase(text):
			return text.toUpperCase();
		default:
			return text.toUpperCase();
	}
}

export function transformCase(text: string, transform: CaseTransform): string {
	switch (transform) {
		case "upper":
			return text.toUpperCase();
		case "lower":
			return text.toLowerCase();
		case "title":
			return toTitleCase(text);
		case "next":
			return nextCase(text);
	}
}

/* ------------------------------------------------------------- word groups */

/**
 * The offset one "group" away from `offset`, the way Ctrl-arrow moves.
 *
 * A group is a run of characters in the same category (word, punctuation).
 * Whitespace, line breaks included, is absorbed into the group that follows it
 * in the direction of travel, so repeated calls walk across the document.
 */
export function groupBoundary(state: EditorState, offset: number, forward: boolean): number {
	const { doc } = state;
	const categorize = state.charCategorizer(offset);
	let position = offset;
	let category: CharCategory | null = null;

	for (;;) {
		const next = forward ? position : position - 1;
		if (next < 0 || next >= doc.length) {
			return position;
		}
		const char = doc.sliceString(next, next + 1);
		const charCategory = categorize(char);
		if (category === null || category === CharCategory.Space) {
			category = charCategory;
		} else if (category !== charCategory) {
			return position;
		}
		position += forward ? 1 : -1;
	}
}

/* -------------------------------------------------------------- occurrences */

// No lookbehind: it is unsupported on iOS before 16.4, and this plugin runs on mobile.
const WORD_CLASS = "\\p{L}\\p{M}\\p{N}_";

function escapeRegex(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Offsets of every occurrence of `needle`, optionally only as whole words. */
export function findOccurrences(text: string, needle: string, wholeWord: boolean): number[] {
	if (needle.length === 0) {
		return [];
	}
	const pattern = escapeRegex(needle);
	if (!wholeWord) {
		return Array.from(text.matchAll(new RegExp(pattern, "gu")), (match) => match.index);
	}
	// The character before is matched, not looked behind at, and skipped over.
	const expression = new RegExp(`(^|[^${WORD_CLASS}])(${pattern})(?![${WORD_CLASS}])`, "gu");
	return Array.from(text.matchAll(expression), (match) => match.index + (match[1]?.length ?? 0));
}

/** True when `needle` is a single word, so it should only match whole words. */
export function isWholeWord(needle: string): boolean {
	return needle.length > 0 && [...needle].every(isWordChar);
}

/* --------------------------------------------------------------- enclosures */

const BRACKETS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set(Object.values(BRACKETS));
const QUOTES = ["'", '"', "`"];

export type EnclosureKind = "brackets" | "quotes" | "both";

/** A delimited region: `open` and `close` are the offsets of the delimiters. */
export interface Enclosure {
	open: number;
	close: number;
}

/**
 * Every region around `[from, to]` delimited by brackets and/or quotes,
 * innermost first.
 *
 * Brackets nest, so they are matched with a stack and may span lines. Quotes
 * do not nest and are paired within the line, left to right.
 */
export function findEnclosures(
	text: string,
	from: number,
	to: number,
	kind: EnclosureKind,
): Enclosure[] {
	const found: Enclosure[] = [];
	if (kind !== "quotes") {
		found.push(...bracketEnclosures(text, from, to));
	}
	if (kind !== "brackets") {
		found.push(...quoteEnclosures(text, from, to));
	}
	return found.sort((a, b) => a.close - a.open - (b.close - b.open));
}

function bracketEnclosures(text: string, from: number, to: number): Enclosure[] {
	const found: Enclosure[] = [];
	const pending: string[] = [];
	for (let i = from - 1; i >= 0; i--) {
		const char = text.charAt(i);
		if (CLOSERS.has(char)) {
			pending.push(char);
			continue;
		}
		const closer = BRACKETS[char];
		if (closer === undefined) {
			continue;
		}
		if (pending[pending.length - 1] === closer) {
			pending.pop();
			continue;
		}
		const close = matchingCloser(text, i, to);
		if (close !== -1) {
			found.push({ open: i, close });
		}
	}
	return found;
}

/** The closer that matches the opener at `open`, if it lies at or after `from`. */
function matchingCloser(text: string, open: number, from: number): number {
	const stack: string[] = [];
	for (let i = open; i < text.length; i++) {
		const char = text.charAt(i);
		const closer = BRACKETS[char];
		if (closer !== undefined) {
			stack.push(closer);
		} else if (CLOSERS.has(char)) {
			if (stack.pop() !== char) {
				return -1;
			}
			if (stack.length === 0) {
				return i >= from ? i : -1;
			}
		}
	}
	return -1;
}

function quoteEnclosures(text: string, from: number, to: number): Enclosure[] {
	const lineStart = text.lastIndexOf("\n", Math.max(from - 1, 0)) + 1;
	const newline = text.indexOf("\n", to);
	const lineEnd = newline === -1 ? text.length : newline;
	const found: Enclosure[] = [];

	for (const quote of QUOTES) {
		const positions: number[] = [];
		for (let i = lineStart; i < lineEnd; i++) {
			if (text.charAt(i) === quote) {
				positions.push(i);
			}
		}
		for (let i = 0; i + 1 < positions.length; i += 2) {
			const open = positions[i] ?? 0;
			const close = positions[i + 1] ?? 0;
			if (open < from && close >= to) {
				found.push({ open, close });
			}
		}
	}
	return found;
}
