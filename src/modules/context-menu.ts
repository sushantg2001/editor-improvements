import { Notice } from "obsidian";

import type { FeatureModule, ModuleContext } from "../core/modules";
import type { Contribution } from "../core/registry";

/**
 * Context-menu items that Obsidian offers but never registered as commands.
 *
 * `Select all`, `Copy path` and `Paste as plain text` exist in Obsidian's
 * right-click menus but have no command behind them, so as the app ships there
 * is no way to put them on a shortcut. Contributing them here gives each one a
 * palette entry and a hotkey slot.
 *
 * Clipboard copy/cut/paste are deliberately absent: `editor:copy`,
 * `editor:cut` and `editor:paste` already exist and are already bindable.
 */
export function contextMenuContribution({ app, getVim }: ModuleContext): Contribution {
	return {
		actions: [
			{
				id: "selectAll",
				name: "Select all",
				group: "Selection",
				kind: "action",
				run: (ctx) => {
					const vim = getVim();
					if (vim && ctx.mode !== "insert") {
						// Vim's own machinery, so we land in linewise visual
						// mode with the whole buffer selected, like `ggVG`.
						vim.handleEx(ctx.cm, "normal ggVG");
						return;
					}
					ctx.view.dispatch({
						selection: { anchor: 0, head: ctx.view.state.doc.length },
					});
				},
			},
			{
				id: "copyPath",
				name: "Copy path",
				group: "File",
				kind: "action",
				needsEditor: false,
				run: async () => {
					const file = app.workspace.getActiveFile();
					if (!file) {
						new Notice("Editor Improvements: no active file.");
						return;
					}
					await navigator.clipboard.writeText(file.path);
					new Notice(`Copied path: ${file.path}`);
				},
			},
			{
				id: "pasteAsPlainText",
				name: "Paste as plain text",
				group: "Clipboard",
				kind: "action",
				resultMode: "insert",
				run: async (ctx) => {
					const text = await navigator.clipboard.readText();
					if (text) {
						ctx.editor.replaceSelection(text);
					}
				},
			},
		],
	};
}

export const contextMenuModule: FeatureModule = {
	id: "context-menu",
	title: "Context-menu items as commands",
	create: (ctx) => ({ contribution: contextMenuContribution(ctx) }),
};
