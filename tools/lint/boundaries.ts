// Which part of `src/` may import which. Paths are relative to `src/`, without
// an extension. A target names one file or a whole folder.

interface Allowed {
	target: string;
	typesOnly?: boolean;
}

const allow = (...targets: string[]): Allowed[] => targets.map((target) => ({ target }));

const RULES: Record<string, Allowed[]> = {
	notation: [],
	events: [],
	"diagnostics/log": [],
	diagnostics: allow("diagnostics/log"),
	settings: allow("events"),
	"device-state": allow("events"),
	engine: allow("notation", "events", "diagnostics"),
	actions: allow("notation", "engine/engine", "events", "diagnostics", "ui/notices"),
	router: allow("notation", "actions/registry", "engine/engine", "events", "diagnostics"),
	lua: [
		...allow("notation", "actions", "engine/engine", "events", "diagnostics"),
		{ target: "router/router", typesOnly: true },
	],
	lifecycle: allow("notation", "events", "diagnostics", "settings", "device-state", "engine", "actions", "router", "lua", "ui"),
	ui: allow("events", "actions/registry", "settings", "diagnostics"),
	main: allow("container", "lifecycle"),
};

const covers = (target: string, path: string): boolean => path === target || path.startsWith(`${target}/`);

/** The part of `src/` a path belongs to, or null for a part with no rule, such as `container`. */
export function areaOf(path: string): string | null {
	if (path === "diagnostics/log") return "diagnostics/log";
	const first = path.split("/")[0] ?? path;
	return first in RULES ? first : null;
}

/** Whether a file at `from` may import `to`. Both are relative to `src/`. */
export function mayImport(from: string, to: string, typeOnly: boolean): boolean {
	const area = areaOf(from);
	if (area === null) return true;
	const own = area === "diagnostics/log" ? from : area;
	if (covers(own, to)) return true;
	return (RULES[area] ?? []).some((rule) => covers(rule.target, to) && (typeOnly || !rule.typesOnly));
}
