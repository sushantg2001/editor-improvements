import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Vim, getCM, vim } from "@replit/codemirror-vim";

import type { CodeMirrorShim, VimApi, VimContext } from "../../src/types";

/**
 * Builds a real CodeMirror 6 editor with the real vim extension — the same
 * library Obsidian bundles — so these tests exercise actual vim behaviour
 * rather than a hand-written stand-in.
 */
export function makeEditor(doc: string) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const view = new EditorView({
		state: EditorState.create({ doc, extensions: [vim()] }),
		parent,
	});
	const cm = getCM(view) as unknown as CodeMirrorShim;

	// Mirror how Obsidian publishes the API, so code under test resolves it
	// exactly the way it will at runtime.
	(window as unknown as Record<string, unknown>).CodeMirrorAdapter = { Vim };

	return {
		view,
		cm,
		parent,
		ctx: {
			app: {} as never,
			editor: {} as never,
			view,
			cm,
			mode: "normal",
		} as unknown as VimContext,
	};
}

/** The real Vim API, typed against our own interface to prove they agree. */
export const vimApi = Vim as unknown as VimApi;

/** Feeds keys through vim's own key handler. */
export function press(cm: CodeMirrorShim, ...keys: string[]): void {
	for (const key of keys) {
		vimApi.handleKey(cm, key, "user");
	}
}

export function modeOf(cm: CodeMirrorShim): string {
	return cm.state.vim?.mode ?? "normal";
}

/** The plugin's own view of the vim mode, so tests read it the way production does. */
export { getVimMode } from "../../src/core/editor";
