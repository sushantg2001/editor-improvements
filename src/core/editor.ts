import { MarkdownView } from "obsidian";
import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";

import type { CodeMirrorShim, VimMode } from "../types";

declare module "obsidian" {
	interface Editor {
		/**
		 * Undocumented: the CodeMirror 6 view backing this editor. `cm.cm` is the
		 * CodeMirror 5 compatibility shim that the Vim addon operates on.
		 */
		cm?: EditorView & { cm?: CodeMirrorShim };
	}
}

export function getActiveMarkdownView(app: App): MarkdownView | null {
	return app.workspace.getActiveViewOfType(MarkdownView);
}

/** The CodeMirror 6 view backing the active editor. */
export function getActiveEditorView(app: App): EditorView | null {
	return getActiveMarkdownView(app)?.editor.cm ?? null;
}

/**
 * The CodeMirror 5 compatibility shim, which is what every Vim API call expects
 * as its `cm` argument.
 */
export function getActiveCm(app: App): CodeMirrorShim | null {
	return getActiveMarkdownView(app)?.editor.cm?.cm ?? null;
}

/**
 * Reads the current vim mode straight off CodeMirror's vim state.
 *
 * Note the spellings: normal mode leaves `mode` undefined, and the visual
 * sub-modes are space-separated (`"visual line"`, `"visual block"`), not
 * `"visual"`. Treating them as unknown is why an earlier version reported
 * NORMAL while the user was in `V`.
 */
export function getVimMode(cm: CodeMirrorShim | null): VimMode {
	switch (cm?.state.vim?.mode) {
		case "insert":
			return "insert";
		case "replace":
			return "replace";
		case "visual":
			return "visual";
		case "visual line":
			return "visual-line";
		case "visual block":
			return "visual-block";
		default:
			return "normal";
	}
}
