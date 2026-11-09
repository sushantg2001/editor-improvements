import { EditorSelection } from "@codemirror/state";
import type { SelectionRange, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { EditorPosition } from "obsidian";

import type { CodeMirrorShim } from "../types";

/**
 * Position and selection helpers that know how vim lays things out in
 * CodeMirror 6.
 *
 * Two facts matter, both verified against the real addon in
 * `tests/integration/core/vim-editing.test.ts`:
 *
 * - In visual mode the selection includes the character under vim's cursor, so
 *   CodeMirror's head sits one past the cursor when selecting forwards.
 * - Normal mode cannot rest on the newline: the cursor stops on the last
 *   character of a non-empty line.
 */

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function offsetToPos(doc: Text, offset: number): EditorPosition {
	const line = doc.lineAt(clamp(offset, 0, doc.length));
	return { line: line.number - 1, ch: clamp(offset, 0, doc.length) - line.from };
}

export function posToOffset(doc: Text, pos: EditorPosition): number {
	const line = doc.line(clamp(pos.line + 1, 1, doc.lines));
	return line.from + clamp(pos.ch, 0, line.length);
}

/** Where vim's cursor is for a CodeMirror range in visual mode. */
export function vimHeadOffset(range: SelectionRange): number {
	return range.head > range.anchor ? range.head - 1 : range.head;
}

/** Where vim's anchor is for a CodeMirror range in visual mode. */
export function vimAnchorOffset(range: SelectionRange): number {
	return range.anchor > range.head ? range.anchor - 1 : range.anchor;
}

/** The CodeMirror range for a visual selection between two vim offsets. */
export function visualRange(doc: Text, vimAnchor: number, vimHead: number): SelectionRange {
	return vimHead >= vimAnchor
		? EditorSelection.range(vimAnchor, Math.min(vimHead + 1, doc.length))
		: EditorSelection.range(Math.min(vimAnchor + 1, doc.length), vimHead);
}

/** Clamps a normal-mode cursor off the newline. */
export function clampToNormal(doc: Text, offset: number): number {
	const line = doc.lineAt(clamp(offset, 0, doc.length));
	return line.length > 0 && offset >= line.to ? line.to - 1 : offset;
}

/**
 * Moves one range to `destination` (a vim offset): extends the selection in
 * visual mode, collapses to a cursor otherwise.
 */
export function moveRange(
	doc: Text,
	range: SelectionRange,
	destination: number,
	visual: boolean,
): SelectionRange {
	const target = clamp(destination, 0, doc.length);
	return visual
		? visualRange(doc, vimAnchorOffset(range), target)
		: EditorSelection.cursor(target);
}

/**
 * Sets the selection in a way vim notices.
 *
 * While vim is handling a key it ignores selection changes made behind its
 * back, so a selection set from inside an action never switches vim into
 * visual mode, and an operator pressed next acts on a stale selection. Vim
 * does take up a selection set once its key handling is over, which is what a
 * mouse selection is, so inside a vim key the change is deferred to just after
 * it. From the palette there is no key handling to wait out and it is applied
 * at once.
 */
export function placeSelection(
	view: EditorView,
	cm: CodeMirrorShim,
	selection: EditorSelection,
): void {
	const apply = (): void => {
		view.dispatch({ selection, scrollIntoView: true });
	};
	if (cm.curOp?.isVimOp) {
		queueMicrotask(apply);
	} else {
		apply();
	}
}
