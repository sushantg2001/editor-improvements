/** Settings synced with the vault in `data.json`. */
export interface Settings {
	version: 1;
	/** The config folder, relative to the vault. Empty means the default. */
	configFolder: string;
}

export const DEFAULT_SETTINGS: Settings = { version: 1, configFolder: "" };

/** Accepts whatever is in `data.json` and returns valid settings. */
export function normalizeSettings(raw: unknown): Settings {
	const folder = typeof raw === "object" && raw !== null ? (raw as { configFolder?: unknown }).configFolder : "";
	return { version: 1, configFolder: typeof folder === "string" ? folder.trim().replace(/^\/+|\/+$/g, "") : "" };
}
