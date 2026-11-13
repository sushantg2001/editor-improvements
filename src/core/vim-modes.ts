import type { CodeMirrorShim, VimApi } from "../types";

/**
 * Sends a key to vim on behalf of an action.
 *
 * The origin is "mapping", which is what vim itself passes for the keys a
 * mapping expands to. It matters for macros: a key from "user" is recorded
 * while a macro is being recorded, so a command that sends `V` would be
 * recorded as the command *and* the `V`, and replaying the macro would run
 * both. For the same reason the key is kept out of what `.` repeats.
 */
export function sendKey(vim: VimApi, cm: CodeMirrorShim, key: string): void {
	// An edit key records itself as the last change, for the dot command. The
	// command that sent it was recorded first, so without this `.` repeats the
	// key and not the command: a command that enters insert mode would be
	// repeated as a bare `i`.
	const state = cm.state.vim;
	const before = state && {
		input: state.lastEditInputState,
		action: state.lastEditActionCommand,
	};
	vim.handleKey(cm, key, "mapping");
	if (state && before) {
		state.lastEditInputState = before.input;
		state.lastEditActionCommand = before.action;
	}
}

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
	sendKey(vim, cm, "i");
}

/** Leaves any visual mode, `V` and `<C-v>` included. */
export function leaveVisual(vim: VimApi, cm: CodeMirrorShim): void {
	if (isVisual(cm)) {
		vim.exitVisualMode(cm);
	}
}
