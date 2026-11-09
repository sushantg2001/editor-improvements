import type { EditorPosition } from "obsidian";

/**
 * Modes we distinguish in the UI.
 *
 * CodeMirror reports these on `cm.state.vim.mode` as `undefined` (normal),
 * `"insert"`, `"visual"`, `"visual line"`, `"visual block"` and `"replace"` —
 * verified in `tests/integration/selection.test.ts`.
 */
export type VimMode =
	| "normal"
	| "insert"
	| "visual"
	| "visual-line"
	| "visual-block"
	| "replace";

/** Vim's per-editor state, as CodeMirror's vim addon keeps it. */
export interface VimState {
	mode?: string;
	insertMode?: boolean;
	visualMode?: boolean;
	/** True in `V` (linewise) visual mode. */
	visualLine?: boolean;
	/** True in `<C-v>` (blockwise) visual mode. */
	visualBlock?: boolean;
	sel?: { anchor: EditorPosition; head: EditorPosition } | null;
}

/** The CodeMirror 5 compatibility shim that Obsidian hands to the Vim addon. */
export interface CodeMirrorShim {
	state: { vim?: VimState };
	getInputField(): HTMLElement;
	on(event: string, handler: (...args: unknown[]) => void): void;
	off(event: string, handler: (...args: unknown[]) => void): void;
	listSelections(): { anchor: EditorPosition; head: EditorPosition }[];
	setCursor(line: number, ch: number): void;
	operation<T>(fn: () => T): T;
	/** Present only while an operation is in flight. */
	curOp?: { isVimOp?: boolean };
}

/** A vim register. Obsidian pre-defines `"`, `.`, `:`, `/` and `+`. */
export interface VimRegister {
	keyBuffer: string[];
	linewise: boolean;
	blockwise: boolean;
	setText(text: string, linewise?: boolean, blockwise?: boolean): void;
	pushText(text: string, linewise?: boolean): void;
	clear(): void;
	toString(): string;
}

export interface VimRegisterController {
	registers: Record<string, VimRegister>;
	getRegister(name: string): VimRegister;
}

export interface ExParams {
	args?: string[];
	argString: string;
	line?: number;
}

/**
 * The subset of `window.CodeMirrorAdapter.Vim` we rely on. Verified against the
 * `@replit/codemirror-vim` copy bundled in Obsidian 1.12.x.
 */
export interface VimApi {
	map(lhs: string, rhs: string, context?: string): void;
	noremap(lhs: string, rhs: string, context?: string): void;
	unmap(lhs: string, context?: string): boolean;
	mapclear(context?: string): void;
	mapCommand(
		keys: string,
		type: "motion" | "action" | "operator" | "operatorMotion",
		name: string,
		args?: unknown,
		extra?: Record<string, unknown>,
	): void;
	defineMotion(name: string, fn: (...args: unknown[]) => unknown): void;
	defineAction(name: string, fn: (...args: unknown[]) => unknown): void;
	defineOperator(name: string, fn: (...args: unknown[]) => unknown): void;
	defineEx(
		name: string,
		shortName: string,
		fn: (cm: CodeMirrorShim, params: ExParams) => void,
	): void;
	defineOption(
		name: string,
		defaultValue: unknown,
		type: "string" | "number" | "boolean",
		aliases?: string[],
		callback?: (value: unknown, cm: CodeMirrorShim | undefined) => void,
	): void;
	defineRegister(name: string, register: VimRegister): void;
	getRegisterController(): VimRegisterController;
	handleEx(cm: CodeMirrorShim, input: string): void;
	handleKey(cm: CodeMirrorShim, key: string, origin?: string): void;
	/** Returns an Error, rather than throwing one, for an unknown option or a bad value. */
	setOption(name: string, value: unknown, cm?: CodeMirrorShim): unknown;
	getOption(name: string, cm?: CodeMirrorShim): unknown;
	enterInsertMode(cm: CodeMirrorShim, args?: unknown, vim?: unknown): void;
	exitInsertMode(cm: CodeMirrorShim): void;
	exitVisualMode(cm: CodeMirrorShim, moveHead?: boolean): void;
}

export interface EditorImprovementsSettings {
	/** Show the current vim mode in the status bar. */
	showModeInStatusBar: boolean;
	/** Prompt text per mode, shown in the status bar. */
	modePrompts: Record<VimMode, string>;
	/**
	 * Run JavaScript from the vault. Off by default: these are arbitrary
	 * scripts that a synced vault will execute on every device.
	 */
	scriptsEnabled: boolean;
	/** Folder holding the scripts, relative to the vault root. */
	scriptsFolder: string;
	/** Prefix `<leader>` expands to, unless a script overrides it. */
	leader: string;
}

/* ------------------------------------------------------------------ actions */

export type VimActionKind = "action" | "motion" | "operator";

/**
 * Vim mapping contexts, spelled exactly as CodeMirror's vim addon names them —
 * these are the strings `nmap`, `vmap`, `imap` and `omap` pass through.
 *
 * `operatorPending` is declarable (that is what `omap` targets) and is *also*
 * derived automatically for normal-mode motions, since a motion that is not
 * visible in that context silently does nothing after `d`. See
 * `resolveBindings`.
 */
export type BindingContext = "normal" | "visual" | "insert" | "operatorPending";

export interface KeyBinding {
	keys: string;
	contexts: BindingContext[];
}

/**
 * Where a contribution came from.
 *
 * Re-setting a source replaces everything it contributed, and errors are
 * attributed to it by name, so this doubles as the label a user sees. By
 * convention: `builtin`, `module:<name>` for a feature module, `script:<file>`
 * for a user script. Deliberately a plain string — a template-literal union
 * bought nothing and made every call site fight the type.
 */
export type ActionSource = string;

export interface VimRange {
	from: EditorPosition;
	to: EditorPosition;
}

export interface VimActionArgs {
	repeat: number;
	register?: string;
	/** Present for operators: the range the operator was invoked over. */
	range?: VimRange;
}

/** What an action may hand back. Motions return a position, operators a range. */
export type VimActionResult = void | EditorPosition | VimRange;

/** What every action gets, editor or not. */
export interface VimContextBase {
	app: import("obsidian").App;
	mode: VimMode;
}

/**
 * The full context, handed to any action that has not opted out with
 * `needsEditor: false`. `run` is declared as a method so its parameter is
 * bivariant, which lets an editor-free action declare `ctx: VimContextBase`.
 */
export interface VimContext extends VimContextBase {
	editor: import("obsidian").Editor;
	/** CodeMirror 6 view. */
	view: import("@codemirror/view").EditorView;
	/** CodeMirror 5 shim — what the Vim API operates on. */
	cm: CodeMirrorShim;
}

export interface VimActionDef {
	id: string;
	name: string;
	group: string;
	kind: VimActionKind;
	/** Register an Obsidian command (and so a hotkey slot). Defaults to true. */
	command?: boolean;
	/** Requires an active editor. Defaults to true. */
	needsEditor?: boolean;
	defaultKeys?: KeyBinding[];
	/** Mode to leave the editor in once the action completes. */
	resultMode?: "insert" | "normal";
	run(ctx: VimContext, args: VimActionArgs): VimActionResult | Promise<VimActionResult>;
}

