import { findClusterBreak } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";

import { groupBoundary } from "./text";

/**
 * Where a cursor goes: pure functions from a document offset to another, with a
 * count. They are the bodies of the motions, so the same code serves a vim key,
 * an operator (`d` + the key) and a palette command.
 */
export type Move = (state: EditorState, offset: number, count: number) => number;

function repeat(count: number, start: number, step: (offset: number) => number): number {
	let offset = start;
	for (let i = 0; i < count; i++) {
		const next = step(offset);
		if (next === offset) {
			break;
		}
		offset = next;
	}
	return offset;
}

export const lineStart: Move = (state, offset) => state.doc.lineAt(offset).from;

export const lineEnd: Move = (state, offset) => state.doc.lineAt(offset).to;

export const documentStart: Move = () => 0;

export const documentEnd: Move = (state) => state.doc.length;

/** Keeps the column, or the line's end if it is shorter. */
function byLines(state: EditorState, offset: number, delta: number): number {
	const { doc } = state;
	const line = doc.lineAt(offset);
	const target = doc.line(Math.max(1, Math.min(doc.lines, line.number + delta)));
	return target.from + Math.min(offset - line.from, target.length);
}

export const lineBelow: Move = (state, offset, count) => byLines(state, offset, count);

export const lineAbove: Move = (state, offset, count) => byLines(state, offset, -count);

function byChar(state: EditorState, offset: number, forward: boolean): number {
	const { doc } = state;
	const line = doc.lineAt(offset);
	if (forward) {
		return offset >= line.to
			? Math.min(offset + 1, doc.length)
			: line.from + findClusterBreak(line.text, offset - line.from, true);
	}
	return offset <= line.from
		? Math.max(offset - 1, 0)
		: line.from + findClusterBreak(line.text, offset - line.from, false);
}

export const charForward: Move = (state, offset, count) =>
	repeat(count, offset, (at) => byChar(state, at, true));

export const charBackward: Move = (state, offset, count) =>
	repeat(count, offset, (at) => byChar(state, at, false));

export const wordForward: Move = (state, offset, count) =>
	repeat(count, offset, (at) => groupBoundary(state, at, true));

export const wordBackward: Move = (state, offset, count) =>
	repeat(count, offset, (at) => groupBoundary(state, at, false));

/**
 * A move to the end of the nearest heading line in `direction`, using heading
 * line numbers from the metadata cache.
 *
 * With no heading left in that direction it goes to the edge of the document.
 */
export function headingMove(
	headingLines: () => number[],
	direction: "next" | "previous",
): Move {
	return (state, offset, count) =>
		repeat(count, offset, (at) => {
			const { doc } = state;
			const current = doc.lineAt(at).number - 1;
			const lines = headingLines();
			const target =
				direction === "next"
					? (lines.filter((line) => line > current).sort((a, b) => a - b)[0] ?? doc.lines - 1)
					: (lines.filter((line) => line < current).sort((a, b) => b - a)[0] ?? 0);
			// The cache can lag the document, so a heading line may be past the end.
			return doc.line(Math.min(target, doc.lines - 1) + 1).to;
		});
}
