import type { App } from "obsidian";

const CONFLICTS: Record<string, string> = {
	"vim-motions": "Vim Motions",
	"obsidian-vimrc-support": "Vimrc Support",
	"obsidian-editor-shortcuts": "Editor Shortcuts",
	"vim-tools": "Vim Tools",
};

/** The name of an enabled plugin that also takes over keys, if any. */
export function findConflict(app: App): string | null {
	const enabled = (app as unknown as { plugins: { enabledPlugins: Set<string> } }).plugins.enabledPlugins;
	for (const [id, name] of Object.entries(CONFLICTS)) {
		if (enabled.has(id)) return name;
	}
	return null;
}
