import { Notice, normalizePath } from "obsidian";
import type { App } from "obsidian";

import { TYPINGS, TYPINGS_FILENAME } from "./typings";

const STARTER_INIT = `// Vim Tools configuration. Reloads automatically when you save.
//
// Everything here runs as ordinary JavaScript with full access to your vault,
// so treat it the way you would any other script you execute.

// What <leader> expands to in the mappings below.
vim.leader(" ");
// Space already moves right, and a key that means something on its own hides
// every longer mapping that starts with it. Free it to use it as the leader.
vim.nunmap("<Space>");

// Plain remaps, exactly as in a vimrc.
vim.inoremap("jk", "<Esc>");
vim.nnoremap("H", "^");
vim.nnoremap("L", "$");

// Run any Obsidian command. Find ids in Settings -> Hotkeys.
vim.action("openToday", () => vim.obcommand("daily-notes"), {
	name: "Open today's daily note",
	needsEditor: false,
});
vim.nmap("<leader>d", "openToday");

// A motion returns a position, so it composes with operators: dgL, ygL, cgL.
vim.motion("toLastLine", (ctx) => ({
	line: ctx.editor.lastLine(),
	ch: 0,
}));
vim.nmap("gL", "toLastLine");
`;

/**
 * Creates the scripts folder, a commented `init.js`, and the ambient typings,
 * so there is something concrete to edit rather than a blank page.
 *
 * The typings are the plugin's to own and are rewritten every time; `init.js`
 * is the user's and is never overwritten.
 */
export async function scaffoldScripts(app: App, folder: string): Promise<void> {
	const { adapter } = app.vault;
	try {
		if (!(await adapter.exists(folder))) {
			await adapter.mkdir(folder);
		}
		await adapter.write(normalizePath(`${folder}/${TYPINGS_FILENAME}`), TYPINGS);

		const initPath = normalizePath(`${folder}/init.js`);
		if (await adapter.exists(initPath)) {
			new Notice(`Vim Tools: ${folder} already has an init.js — left as is.`);
			return;
		}
		await adapter.write(initPath, STARTER_INIT);
		new Notice(`Vim Tools: created ${initPath}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Vim Tools: could not create ${folder}\n${message}`, 8000);
	}
}
