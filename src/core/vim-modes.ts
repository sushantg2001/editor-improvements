import type { CodeMirrorShim, VimApi } from "../types";

/** True in `v`, `V` and `<C-v>` alike. */
export function isVisual(cm: CodeMirrorShim): boolean {
	return cm.state.vim?.visualMode === true;
}

/** True in insert and replace mode, which vim treats as one family. */
export function isInsertLike(cm: CodeMirrorShim): boolean {
	const mode = cm.state.vim?.mode;
	return cm.state.vim?.insertMode === true || mode === "insert" || mode === "replace";
}

/**
 * Enters insert mode at the cursor.
 *
 * The Vim API has no `enterInsertMode`; the only way in is the key vim itself
 * uses. `i` means something else in visual mode (a text-object prefix), so a
 * visual selection is left first.
 */
export function enterInsert(vim: VimApi, cm: CodeMirrorShim): void {
	if (isInsertLike(cm)) {
		return;
	}
	if (isVisual(cm)) {
		vim.exitVisualMode(cm);
	}
	vim.handleKey(cm, "i", "user");
}

/** Leaves any visual mode, `V` and `<C-v>` included. */
export function leaveVisual(vim: VimApi, cm: CodeMirrorShim): void {
	if (isVisual(cm)) {
		vim.exitVisualMode(cm);
	}
}
