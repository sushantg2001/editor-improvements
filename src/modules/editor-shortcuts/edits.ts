import { EditorSelection } from "@codemirror/state";
import type { ChangeSpec, EditorState, Line, SelectionRange, TransactionSpec } from "@codemirror/state";

import { belongsToItemAbove, isOrderedPrefix, listMarkerLength, nextListPrefix, renumberFrom } from "./lists";
import {
	findEnclosures,
	findOccurrences,
	groupBoundary,
	isWholeWord,
	isWordChar,
	leadingWhitespace,
	offsetAtColumn,
	transformCase,
	wordRangeAt,
} from "./text";
import type { CaseTransform, EnclosureKind } from "./text";

/**
 * Edits as pure functions of an `EditorState`.
 *
 * Each returns a transaction spec, or null when there is nothing to do. They
 * know nothing about vim or Obsidian, so they are tested with a bare state,
 * and they work on every selection range at once through `changeByRange`
 * (vim keeps one range, except in visual-block mode where it keeps several).
 */
export type Edit = (state: EditorState) => TransactionSpec | null;

export interface EditEnv {
	/** Continue a markdown list when opening a line next to one. */
	continueLists: boolean;
}

/** The lines a range touches. One that ends at a line start does not include that line. */
function lineSpan(state: EditorState, range: SelectionRange): { first: Line; last: Line } {
	const first = state.doc.lineAt(range.from);
	let last = state.doc.lineAt(range.to);
	if (range.to > range.from && last.number > first.number && range.to === last.from) {
		last = state.doc.line(last.number - 1);
	}
	return { first, last };
}

function column(state: EditorState, offset: number): number {
	return offset - state.doc.lineAt(offset).from;
}

function renumberChanges(state: EditorState, fromLine: number, indentation: string): ChangeSpec[] {
	const lines: { from: number; text: string }[] = [];
	for (let n = fromLine; n <= state.doc.lines; n++) {
		const line = state.doc.line(n);
		if (!belongsToItemAbove(line.text, indentation) && !/^\s*\d+\.(?= |$)/.test(line.text)) {
			break;
		}
		lines.push({ from: line.from, text: line.text });
	}
	return renumberFrom(lines, 0, indentation);
}

/* -------------------------------------------------------------- open a line */

export function insertLineBelow(env: EditEnv): Edit {
	return (state) =>
		state.changeByRange((range) => {
			const line = state.doc.lineAt(range.head);
			const indent = leadingWhitespace(line.text);
			let prefix = "";
			const changes: ChangeSpec[] = [];

			if (env.continueLists) {
				const next = nextListPrefix(line.text, "after");
				if (next === null) {
					// An empty list item ends the list rather than continuing it.
					return {
						changes: { from: line.from, to: line.to },
						range: EditorSelection.cursor(line.from),
					};
				}
				prefix = next;
				if (isOrderedPrefix(prefix)) {
					changes.push(...renumberChanges(state, line.number + 1, indent));
				}
			}

			const insert = `\n${indent}${prefix}`;
			changes.unshift({ from: line.to, insert });
			return { changes, range: EditorSelection.cursor(line.to + insert.length) };
		});
}

export function insertLineAbove(env: EditEnv): Edit {
	return (state) =>
		state.changeByRange((range) => {
			const line = state.doc.lineAt(range.head);
			const indent = leadingWhitespace(line.text);
			let prefix = "";
			const changes: ChangeSpec[] = [];

			// Only continue a list when the line above belongs to the same one.
			const insideList =
				line.number > 1 && state.doc.line(line.number - 1).text.trim().length > 0;
			if (env.continueLists && insideList) {
				prefix = nextListPrefix(line.text, "before") ?? "";
				if (isOrderedPrefix(prefix)) {
					changes.push(...renumberChanges(state, line.number, indent));
				}
			}

			const insert = `${indent}${prefix}\n`;
			changes.unshift({ from: line.from, insert });
			return {
				changes,
				range: EditorSelection.cursor(line.from + indent.length + prefix.length),
			};
		});
}

/* ---------------------------------------------------------------- delete */

/**
 * Deletes the lines the selection touches, each once.
 *
 * Ranges on neighbouring lines go as one block. Worked out one range at a time
 * they overlap at the end of the document: the last line takes the newline
 * before it, which the range above it has already taken or left behind.
 */
export const deleteLine: Edit = (state) => {
	const { doc } = state;
	const spans = state.selection.ranges.map((range) => lineSpan(state, range));
	const blocks: { first: Line; last: Line }[] = [];
	for (const span of [...spans].sort((a, b) => a.first.number - b.first.number)) {
		const block = blocks[blocks.length - 1];
		if (block && span.first.number <= block.last.number + 1) {
			if (span.last.number > block.last.number) {
				block.last = span.last;
			}
		} else {
			blocks.push({ ...span });
		}
	}

	const changes = state.changes(
		blocks.map(({ first, last }) =>
			last.number < doc.lines
				? { from: first.from, to: last.to + 1 }
				: // Nothing follows, so take the newline before the block instead.
					{ from: first.number === 1 ? 0 : doc.line(first.number - 1).to, to: last.to },
		),
	);

	// Each cursor goes to the same column on the line that takes the block's place.
	const cursors = state.selection.ranges.map((range, index) => {
		const line = spans[index]!.first.number;
		const block = blocks.find((b) => line >= b.first.number && line <= b.last.number)!;
		const col = column(state, range.head);
		let target = 0;
		if (block.last.number < doc.lines) {
			target = offsetAtColumn(doc.line(block.last.number + 1), col);
		} else if (block.first.number > 1) {
			target = offsetAtColumn(doc.line(block.first.number - 1), col);
		}
		return EditorSelection.cursor(changes.mapPos(target, 1));
	});

	return { changes, selection: EditorSelection.create(cursors, state.selection.mainIndex) };
};

export const deleteToStartOfLine: Edit = (state) =>
	state.changeByRange((range) => {
		if (range.head === 0) {
			return { range };
		}
		const line = state.doc.lineAt(range.head);
		// At the start of a line there is nothing to delete but the newline before it.
		const from = range.head === line.from ? line.from - 1 : line.from;
		return { changes: { from, to: range.head }, range: EditorSelection.cursor(from) };
	});

export const deleteToEndOfLine: Edit = (state) =>
	state.changeByRange((range) => {
		const line = state.doc.lineAt(range.head);
		const to = range.head === line.to ? Math.min(line.to + 1, state.doc.length) : line.to;
		return { changes: { from: range.head, to }, range: EditorSelection.cursor(range.head) };
	});

export function deleteWord(direction: "before" | "after"): Edit {
	return (state) =>
		state.changeByRange((range) => {
			let { from, to } = range;
			if (range.empty) {
				const boundary = groupBoundary(state, range.head, direction === "after");
				from = Math.min(boundary, range.head);
				to = Math.max(boundary, range.head);
			}
			return { changes: { from, to }, range: EditorSelection.cursor(from) };
		});
}

/* ------------------------------------------------------------ join and copy */

export const joinLines: Edit = (state) =>
	state.changeByRange((range) => {
		const { doc } = state;
		const first = doc.lineAt(range.from);
		const requested = Math.max(doc.lineAt(range.to).number - first.number, 1);
		const lastNumber = Math.min(first.number + requested, doc.lines);
		if (lastNumber === first.number) {
			return { range };
		}

		let joined = first.text;
		let appended = "";
		for (let n = first.number + 1; n <= lastNumber; n++) {
			const text = doc.line(n).text;
			const content = text.slice(listMarkerLength(text)).trimStart();
			// A space between the pieces, unless one side has nothing to separate.
			const piece = content && joined && !joined.endsWith(" ") ? ` ${content}` : content;
			joined += piece;
			appended += piece;
		}

		return {
			changes: { from: first.to, to: doc.line(lastNumber).to, insert: appended },
			range: EditorSelection.cursor(first.to),
		};
	});

export function copyLines(direction: "up" | "down"): Edit {
	return (state) =>
		state.changeByRange((range) => {
			const { first, last } = lineSpan(state, range);
			const text = state.doc.sliceString(first.from, last.to);
			if (direction === "up") {
				return { changes: { from: last.to, insert: `\n${text}` }, range };
			}
			const shift = text.length + 1;
			return {
				changes: { from: first.from, insert: `${text}\n` },
				range: EditorSelection.range(range.anchor + shift, range.head + shift),
			};
		});
}

/** The whole line, newline included; a line already selected grows by the next one. */
export const selectLines: Edit = (state) => {
	const ranges = state.selection.ranges.map((range) => {
		const { first, last } = lineSpan(state, range);
		return EditorSelection.range(first.from, Math.min(last.to + 1, state.doc.length));
	});
	return { selection: EditorSelection.create(ranges, state.selection.mainIndex) };
};

/* ------------------------------------------------------------------- case */

export function changeCase(transform: CaseTransform): Edit {
	return (state) =>
		state.changeByRange((range) => {
			let { from, to } = range;
			if (range.empty) {
				const line = state.doc.lineAt(range.head);
				const [start, end] = wordRangeAt(line.text, range.head - line.from);
				from = line.from + start;
				to = line.from + end;
			}
			const original = state.doc.sliceString(from, to);
			const replaced = transformCase(original, transform);
			if (replaced === original) {
				return { range };
			}
			const delta = replaced.length - original.length;
			const shifted = range.empty
				? EditorSelection.cursor(Math.min(range.head, from + replaced.length))
				: EditorSelection.range(
						range.anchor > range.head ? range.anchor + delta : range.anchor,
						range.head > range.anchor ? range.head + delta : range.head,
					);
			return { changes: { from, to, insert: replaced }, range: shifted };
		});
}

/* -------------------------------------------------------------- selections */

/**
 * Grows the selection to the nearest bracket or quote pair around it.
 *
 * Each press goes one step outward: the text inside the delimiters, then the
 * delimiters too, then the pair around that.
 */
export function expandToEnclosure(kind: EnclosureKind): Edit {
	return (state) => {
		const text = state.doc.toString();
		const ranges = state.selection.ranges.map((range) => {
			for (const { open, close } of findEnclosures(text, range.from, range.to, kind)) {
				for (const [from, to] of [
					[open + 1, close],
					[open, close + 1],
				] as const) {
					if (from <= range.from && to >= range.to && (from < range.from || to > range.to)) {
						return EditorSelection.range(from, to);
					}
				}
			}
			return range;
		});
		return { selection: EditorSelection.create(ranges, state.selection.mainIndex) };
	};
}

/** Selects the word under the cursor, or the next occurrence of the selected text. */
export const selectNextOccurrence: Edit = (state) => {
	const { doc } = state;
	const range = state.selection.main;

	if (range.empty) {
		const line = doc.lineAt(range.head);
		const [start, end] = wordRangeAt(line.text, range.head - line.from);
		if (start === end) {
			return null;
		}
		return { selection: EditorSelection.single(line.from + start, line.from + end) };
	}

	const needle = doc.sliceString(range.from, range.to);
	const before = range.from > 0 ? doc.sliceString(range.from - 1, range.from) : "";
	const after = range.to < doc.length ? doc.sliceString(range.to, range.to + 1) : "";
	// A selected whole word only matches whole words; anything else matches anywhere.
	const wholeWord = isWholeWord(needle) && !isWordChar(before) && !isWordChar(after);
	const matches = findOccurrences(doc.toString(), needle, wholeWord);
	const next = matches.find((offset) => offset > range.from) ?? matches.find((o) => o !== range.from);
	if (next === undefined) {
		return null;
	}
	return { selection: EditorSelection.single(next, next + needle.length) };
};

/** Extends each range's head by one word, the way Ctrl-Shift-arrow does. */
export function selectByWord(direction: "before" | "after"): Edit {
	return (state) => {
		const ranges = state.selection.ranges.map((range) =>
			EditorSelection.range(
				range.anchor,
				groupBoundary(state, range.head, direction === "after"),
			),
		);
		return { selection: EditorSelection.create(ranges, state.selection.mainIndex) };
	};
}
