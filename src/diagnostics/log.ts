export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
	at: number;
	level: LogLevel;
	area: string;
	message: string;
}

const LIMIT = 500;
const entries: LogEntry[] = [];

/** Records one entry in a ring buffer. Errors also reach the developer console. */
export function log(level: LogLevel, area: string, message: string): void {
	entries.push({ at: Date.now(), level, area, message });
	if (entries.length > LIMIT) entries.shift();
	if (level === "error") console.error(`[editor-improvements:${area}] ${message}`);
}

export function recentLog(): readonly LogEntry[] {
	return entries;
}
