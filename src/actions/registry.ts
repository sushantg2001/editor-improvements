import type { EditorView } from "@codemirror/view";
import type { App } from "obsidian";
import { log } from "../diagnostics/log";
import type { Engine, EngineMode } from "../engine/engine";
import { parseKeys } from "../notation/parse";

export type Context = "editor" | "input" | "transient" | "modal" | `view:${string}` | "global";
export type ActionResult = "handled" | "not-applicable" | "error";

/** Where a key was pressed. */
export interface Classified {
	context: Context;
	mode?: EngineMode;
	viewType?: string;
	win: Window;
	editorView?: EditorView;
}

export interface RunContext {
	/** Null when run from the command palette or from Lua. */
	classified: Classified | null;
	event: KeyboardEvent | null;
	/** The mapped keys, when a key ran this action. */
	key?: string;
}

export interface ActionDef {
	id: string;
	title: string;
	repeatable: boolean;
	run(context: RunContext): ActionResult;
}

interface CommandRegistry {
	findCommand(id: string): unknown;
	executeCommandById(id: string): boolean;
	listCommands(): { id: string; name: string }[];
}

export function commandsOf(app: App): CommandRegistry {
	return (app as unknown as { commands: CommandRegistry }).commands;
}

/** The CodeMirror view of the focused editor, including table cells and canvas cards. */
export function activeEditorView(app: App): EditorView | null {
	const editor = app.workspace.activeEditor?.editor as unknown as { activeCM?: EditorView; cm?: EditorView } | undefined;
	return editor?.activeCM ?? editor?.cm ?? null;
}

/** Every action a key can run. Running one never throws. */
export class ActionRegistry {
	private readonly defs = new Map<string, ActionDef>();

	constructor(
		private readonly app: App,
		private readonly engine: Engine,
		private readonly onError: (id: string, message: string) => void,
	) {}

	register(def: ActionDef): () => void {
		this.defs.set(def.id, def);
		return () => {
			if (this.defs.get(def.id) === def) this.defs.delete(def.id);
		};
	}

	all(): ActionDef[] {
		return [...this.defs.values()];
	}

	/** Finds an action. `keys:`, `ex:` and `obsidian:` actions are made on demand. */
	get(id: string): ActionDef | undefined {
		const known = this.defs.get(id);
		if (known) return known;
		const colon = id.indexOf(":");
		if (colon < 0) return undefined;
		const kind = id.slice(0, colon);
		const name = id.slice(colon + 1);
		if (kind === "keys") return this.keysAction(id, name);
		if (kind === "ex") return this.exAction(id, name);
		if (kind === "obsidian") return this.obsidianAction(id, name);
		return undefined;
	}

	run(id: string, context: RunContext): ActionResult {
		const def = this.get(id);
		if (!def) {
			this.onError(id, `Unknown action: ${id}`);
			return "error";
		}
		try {
			return def.run(context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log("error", "actions", `${id}: ${message}`);
			this.onError(id, `${id}: ${message}`);
			return "error";
		}
	}

	/** Returns a problem for each id that cannot run. */
	validate(ids: Iterable<string>): { id: string; problem: string }[] {
		const problems: { id: string; problem: string }[] = [];
		for (const id of new Set(ids)) {
			if (id.startsWith("obsidian:")) {
				if (!commandsOf(this.app).findCommand(id.slice("obsidian:".length))) problems.push({ id, problem: "no such Obsidian command" });
			} else if (!this.get(id)) {
				problems.push({ id, problem: "no such action" });
			}
		}
		return problems;
	}

	private editorFor(context: RunContext): EditorView | null {
		if (context.classified) return context.classified.context === "editor" ? context.classified.editorView ?? null : null;
		return activeEditorView(this.app);
	}

	private keysAction(id: string, text: string): ActionDef {
		const keys = parseKeys(text);
		return {
			id,
			title: `Keys: ${text}`,
			repeatable: true,
			run: (context) => {
				const view = this.editorFor(context);
				if (!view) return "not-applicable";
				this.engine.feedKeys(view, keys);
				return "handled";
			},
		};
	}

	private exAction(id: string, command: string): ActionDef {
		return {
			id,
			title: `Ex: ${command}`,
			repeatable: false,
			run: (context) => {
				const view = this.editorFor(context);
				if (!view) return "not-applicable";
				const error = this.engine.runEx(view, command);
				if (error) throw new Error(error);
				return "handled";
			},
		};
	}

	private obsidianAction(id: string, command: string): ActionDef {
		return {
			id,
			title: `Command: ${command}`,
			repeatable: false,
			run: () => (commandsOf(this.app).executeCommandById(command) ? "handled" : "not-applicable"),
		};
	}
}
