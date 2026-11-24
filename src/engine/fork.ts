// The only file that imports the forked vim engine.
import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, setLivePreviewField, vim, Vim } from "@saberzero1/codemirror-vim";
import { editorLivePreviewField } from "obsidian";
import { log } from "../diagnostics/log";
import { rhsToEngine, toEngine } from "../notation/engine";
import type { Key, KeySeq, Rhs } from "../notation/parse";
import type { Engine, EngineGeneration, EngineMode, MapMode } from "./engine";

const CONTEXTS: Record<MapMode, string> = { n: "normal", i: "insert", v: "visual", x: "visual", o: "operatorPending" };
const EX_CONTEXTS = ["normal", "visual", "operatorPending", "insert"];

type VimCM = NonNullable<ReturnType<typeof getCM>>;

let ltKeyInstalled = false;

/**
 * A right-hand side spells `<` as `<lt>`, as the engine reads a bare `<` and the `word>` after it as one key,
 * and in insert mode and prompts takes a bare `<` for <Home>. Insert mode and prompts type `<lt>` as `<`,
 * but the engine's commands know only `<`, so this hands it to them as `<`.
 */
function installLtKey(): void {
	if (ltKeyInstalled) return;
	ltKeyInstalled = true;
	const handleKey = Vim.handleKey.bind(Vim);
	Vim.handleKey = (cm, key, origin) => handleKey(cm, key === "<lt>" ? "<" : key, origin);
}

/** The key that runs each `<Cmd>` command, as the engine has no `<Cmd>`. The keymap is shared, so this is too. */
const exKeys = new Map<string, string>();

function exKey(command: string): string {
	let key = exKeys.get(command);
	if (key) return key;
	key = `<EditorImprovementsCmd${exKeys.size + 1}>`;
	exKeys.set(command, key);
	// Built-in, so a noremap right-hand side reaches it.
	for (const context of EX_CONTEXTS) Vim._mapCommand({ keys: key, type: "keyToEx", exArgs: { input: command }, context, builtin: true });
	return key;
}

export class ForkEngine implements Engine {
	private readonly savedOptions = new Map<string, unknown>();
	private host: EditorView | null = null;

	constructor() {
		installLtKey();
	}

	extension(): Extension {
		setLivePreviewField(editorLivePreviewField);
		return Prec.highest(vim());
	}

	release(): void {
		this.clear();
		this.host?.destroy();
		this.host = null;
	}

	private cm(view: EditorView): VimCM | null {
		return getCM(view);
	}

	/** A hidden editor for ex commands that run while no note is open. */
	private hostCM(): VimCM {
		this.host ??= new EditorView({ extensions: [vim()], parent: activeDocument.createElement("div") });
		const cm = getCM(this.host);
		if (!cm) throw new Error("the engine did not attach to its host editor");
		return cm;
	}

	isAttached(view: EditorView): boolean {
		return !!this.cm(view)?.state.vim;
	}

	mode(view: EditorView): EngineMode {
		const state = this.cm(view)?.state.vim;
		if (!state) return "n";
		if (state.insertMode) return state.mode === "replace" ? "R" : "i";
		if (state.visualMode) return state.visualLine || state.visualBlock ? "x" : "v";
		if (state.inputState.operator) return "o";
		return "n";
	}

	feedKeys(view: EditorView, rhs: Rhs): void {
		const cm = this.cm(view);
		if (!cm) return;
		// An ex command runs between the keys around it, so no key is bound for it.
		let keys: KeySeq = [];
		const feed = (): void => {
			if (keys.length > 0) Vim.feedKeys(cm as Parameters<typeof Vim.feedKeys>[0], rhsToEngine(keys, exKey), { noremap: true });
			keys = [];
		};
		for (const step of rhs) {
			if (typeof step === "string") {
				keys.push(step);
				continue;
			}
			feed();
			const error = this.runEx(view, step.ex);
			if (error) throw new Error(error);
		}
		feed();
	}

	deliverKey(view: EditorView, key: Key): void {
		const cm = this.cm(view);
		if (!cm) return;
		const text = toEngine([key]);
		if (Vim.handleKey(cm, text, "user")) return;
		if ([...text].length === 1 || key === "<Space>") {
			view.dispatch(view.state.replaceSelection(key === "<Space>" ? " " : text));
		}
	}

	runEx(view: EditorView | null, command: string): string | null {
		try {
			const cm = (view && this.cm(view)) ?? this.hostCM();
			Vim.handleEx(cm as Parameters<typeof Vim.handleEx>[0], command);
			return null;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	isOption(name: string): boolean {
		return !(Vim.getOption(name) instanceof Error);
	}

	getOption(name: string): unknown {
		const value: unknown = Vim.getOption(name);
		return value instanceof Error ? undefined : value;
	}

	apply(generation: EngineGeneration): string[] {
		this.clear();
		const errors: string[] = [];
		for (const map of generation.maps) {
			const lhs = toEngine(map.lhs);
			const rhs = rhsToEngine(map.rhs, exKey);
			try {
				if (map.noremap) Vim.noremap(lhs, rhs, CONTEXTS[map.mode]);
				else Vim.map(lhs, rhs, CONTEXTS[map.mode]);
			} catch (error) {
				errors.push(`Could not map ${lhs}: ${String(error)}`);
			}
		}
		for (const [name, value] of generation.options) {
			if (!this.savedOptions.has(name)) this.savedOptions.set(name, Vim.getOption(name));
			const result: unknown = Vim.setOption(name, value);
			if (result instanceof Error) errors.push(result.message);
		}
		for (const command of generation.commands) {
			const error = this.runEx(null, command);
			if (error) errors.push(`vim.cmd("${command}"): ${error}`);
		}
		return errors;
	}

	clear(): void {
		Vim.mapclear();
		exKeys.clear();
		for (const [name, value] of this.savedOptions) {
			const result: unknown = Vim.setOption(name, value);
			if (result instanceof Error) log("warn", "engine", result.message);
		}
		this.savedOptions.clear();
	}
}
