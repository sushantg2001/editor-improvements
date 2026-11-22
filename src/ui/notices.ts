import { Notice } from "obsidian";

const shown = new Set<string>();

/** Shows a notice. */
export function notify(message: string, seconds = 6): void {
	new Notice(`Editor Improvements: ${message}`, seconds * 1000);
}

/** Shows each distinct message at most once per session. */
export function notifyOnce(message: string): void {
	if (shown.has(message)) return;
	shown.add(message);
	notify(message, 10);
}
