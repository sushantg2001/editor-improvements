// The only file that imports the forked vim engine.
import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, setLivePreviewField, vim, Vim } from "@saberzero1/codemirror-vim";
import { editorLivePreviewField } from "obsidian";
import { log } from "../diagnostics/log";
import { toEngine } from "../notation/engine";
import type { Key, KeySeq } from "../notation/parse";
import type { Engine, EngineGeneration, EngineMode, MapMode } from "./engine";

const CONTEXTS: Record<MapMode, string> = { n: "normal", i: "insert", v: "visual", x: "visual", o: "operatorPending" };

type VimCM = NonNullable<ReturnType<typeof getCM>>;

export class ForkEngine implements Engine {
	private readonly savedOptions = new Map<string, unknown>();
	private host: EditorView | null = null;

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

	feedKeys(view: EditorView, keys: KeySeq): void {
		const cm = this.cm(view);
		if (cm) Vim.feedKeys(cm as Parameters<typeof Vim.feedKeys>[0], toEngine(keys), { noremap: true });
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
			const rhs = toEngine(map.rhs);
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
		for (const [name, value] of this.savedOptions) {
			const result: unknown = Vim.setOption(name, value);
			if (result instanceof Error) log("warn", "engine", result.message);
		}
		this.savedOptions.clear();
	}
}
