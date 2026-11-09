import { vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/constants";
import { getVimMode } from "../../src/core/editor";
import { VimDispatcher } from "../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../src/core/keymap";
import { ModuleHost } from "../../src/core/modules";
import { ActionRegistry } from "../../src/core/registry";
import { App } from "../mocks/obsidian";
import { makeEditor, vimApi } from "./vim";
import type { FeatureModule } from "../../src/core/modules";
import type { BindingContext, VimApi, VimContext, EditorImprovementsSettings } from "../../src/types";

/**
 * A feature module wired the way the plugin wires it, on a real CodeMirror
 * editor with the real vim addon: module host, registry, dispatcher and the
 * mapping ledger, so a test presses keys and sees what a user would.
 */
export function moduleHarness(
	module: FeatureModule,
	doc: string,
	options: { settings?: Partial<EditorImprovementsSettings>; vim?: VimApi } = {},
) {
	const getVim = () => options.vim ?? vimApi;
	const editor = makeEditor(doc);
	const app = new App();
	const registry = new ActionRegistry();
	const settings = { ...DEFAULT_SETTINGS, ...options.settings };
	const fakeEditor = {
		undo: vi.fn(),
		redo: vi.fn(),
		// What Obsidian's Editor does with a selection: replace it, cursor after the text.
		replaceSelection: (text: string) => {
			editor.view.dispatch(editor.view.state.replaceSelection(text));
		},
	};

	const host = new ModuleHost({
		registry,
		modules: [module],
		context: { app: app as never, getVim, settings: () => settings },
	});
	host.load();

	const dispatcher = new VimDispatcher(
		app as never,
		registry,
		(cm) =>
			({
				...editor.ctx,
				app,
				editor: fakeEditor,
				cm,
				mode: getVimMode(cm),
			}) as unknown as VimContext,
		getVim,
	);
	const ledger = new MappingLedger();

	return {
		...editor,
		app,
		registry,
		dispatcher,
		settings,
		fakeEditor,
		/** Binds `keys` to a module action in the given contexts, then applies the keymap. */
		bind(keys: string, id: string, contexts: BindingContext[] = ["normal", "visual"]) {
			const def = registry.get(id);
			if (!def) {
				throw new Error(`no action ${id}`);
			}
			registry.set(`test:${keys}`, {
				bindings: [{ keys, contexts, target: { kind: "action", id, actionKind: def.kind } }],
			});
			ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
		},
		/** Runs an action the way a hotkey or the palette does. */
		invoke(id: string) {
			dispatcher.invoke(id, editor.cm);
		},
		text: () => editor.view.state.doc.toString(),
		selection: () => {
			const range = editor.view.state.selection.main;
			return { anchor: range.anchor, head: range.head };
		},
		cursor: () => editor.view.state.selection.main.head,
		cleanup() {
			ledger.clear(vimApi);
			host.unload();
		},
	};
}
