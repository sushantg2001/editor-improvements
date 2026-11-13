import type { VimMode, EditorImprovementsSettings } from "./types";

export const PLUGIN_ID = "editor-improvements";

/** Command ids the plugin registers itself; no action may reuse one. */
export const RESERVED_COMMAND_IDS: readonly string[] = [
	"reload-config",
	"show-status",
	"create-scripts-folder",
];

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
export const SCRIPTS_FOLDER_NAME = "editor-improvements";

/** Empty means "use `<configDir>/editor-improvements`" — resolved at runtime. */
export const DEFAULT_SETTINGS: EditorImprovementsSettings = {
	showModeInStatusBar: true,
	scriptsEnabled: false,
	scriptsFolder: "",
	leader: "\\",
	autoInsertListPrefix: true,
	modePrompts: {
		normal: "NORMAL",
		insert: "INSERT",
		visual: "VISUAL",
		"visual-line": "V-LINE",
		"visual-block": "V-BLOCK",
		replace: "REPLACE",
	},
};

/** CSS class placed on the status bar item, and on the editor root as `ei-mode-<mode>`. */
export const MODE_CLASS_PREFIX = "ei-mode-";
