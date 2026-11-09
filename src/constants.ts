import type { VimMode, VimToolsSettings } from "./types";

export const PLUGIN_ID = "vim-tools";

export const VIM_MODES: VimMode[] = [
	"normal",
	"insert",
	"visual",
	"visual-line",
	"visual-block",
	"replace",
];

/** Human labels for the settings tab. */
export const MODE_LABELS: Record<VimMode, string> = {
	normal: "Normal",
	insert: "Insert",
	visual: "Visual",
	"visual-line": "Visual line",
	"visual-block": "Visual block",
	replace: "Replace",
};

/**
 * Folder name appended to the vault's config directory.
 *
 * Deliberately not a full path: the config directory is `.obsidian` by default
 * but users can change it, so the parent is always read from
 * `vault.configDir` rather than assumed.
 */
export const SCRIPTS_FOLDER_NAME = "vim-tools";

/** Empty means "use `<configDir>/vim-tools`" — resolved at runtime. */
export const DEFAULT_SETTINGS: VimToolsSettings = {
	showModeInStatusBar: true,
	scriptsEnabled: false,
	scriptsFolder: "",
	leader: "\\",
	modePrompts: {
		normal: "NORMAL",
		insert: "INSERT",
		visual: "VISUAL",
		"visual-line": "V-LINE",
		"visual-block": "V-BLOCK",
		replace: "REPLACE",
	},
};

/** CSS class placed on the status bar item, and on the editor root as `vt-mode-<mode>`. */
export const MODE_CLASS_PREFIX = "vt-mode-";
