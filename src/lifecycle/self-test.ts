import type { App } from "obsidian";
import { canPaste } from "../actions/native/desktop";
import { commandsOf } from "../actions/registry";
import { hasHotkeyEntry, hasWindowStack } from "../router/obsidian-internals";

/** Checks the Obsidian internals the plugin relies on. Returns the first that is missing. */
export function selfTest(app: App): string | null {
	if (!hasHotkeyEntry(app)) return "Obsidian's hotkey handler was not found";
	if (!hasWindowStack(app)) return "Obsidian's window key stack was not found";
	const commands = commandsOf(app);
	if (typeof commands?.executeCommandById !== "function" || typeof commands.findCommand !== "function" || typeof commands.listCommands !== "function") {
		return "Obsidian's command registry has changed";
	}
	if (!canPaste()) return "Electron's paste is not available";
	return null;
}
