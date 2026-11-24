import type { App } from "obsidian";

const CONFLICTS: Record<string, string> = {
	"vim-motions": "Vim Motions",
	"obsidian-vimrc-support": "Vimrc Support",
	"obsidian-editor-shortcuts": "Editor Shortcuts",
	"vim-tools": "Vim Tools",
};

interface PluginManager {
	enabledPlugins: Set<string>;
	manifests: Record<string, unknown>;
}

/** The name of an installed, enabled plugin that also takes over keys, if any. */
export function findConflict(app: App): string | null {
	const plugins = (app as unknown as { plugins: PluginManager }).plugins;
	for (const [id, name] of Object.entries(CONFLICTS)) {
		// The enabled list keeps the ids of deleted plugins, which never load.
		if (plugins.enabledPlugins.has(id) && Object.hasOwn(plugins.manifests, id)) return name;
	}
	return null;
}
