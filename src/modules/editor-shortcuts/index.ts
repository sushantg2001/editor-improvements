import { EditorSelection } from "@codemirror/state";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { App } from "obsidian";

import { clampToNormal, offsetToPos, placeSelection, posToOffset } from "../../core/vim-editing";
import { isInsertLike, isVisual } from "../../core/vim-modes";
import type { FeatureModule, ModuleContext } from "../../core/modules";
import type { Contribution } from "../../core/registry";
import type { VimActionDef, VimContext } from "../../types";
import * as edits from "./edits";
import { GoToLineModal } from "./go-to-line";
import * as moves from "./movement";
import { wordRangeAt } from "./text";
import type { Edit } from "./edits";
import type { Move } from "./movement";

/**
 * A port of Editor Shortcuts, made vim-aware.
 *
 * The commands keep their ids and names, so moving from the old plugin is a
 * prefix swap in a hotkey or a vimrc. What changes is how they sit in vim:
 *
 * - Movement commands are real motions, so `d` + the key deletes up to it, and
 *   a count repeats them. From the palette they move every cursor, and extend
 *   the selection in visual mode.
 * - Editing commands finish in normal mode when run from visual mode, and
 *   never leave the cursor resting on a newline.
 * - Selections are vim's. Obsidian's vim keeps one selection, so "add a
 *   cursor" is built from visual-block mode, which edits every line at once.
 */

const GROUP = {
	lines: "Lines",
	cursor: "Cursor",
	selection: "Selection",
	text: "Text",
	editor: "Editor",
} as const;

export function editorShortcutsContribution(ctx: ModuleContext): Contribution {
	const { app, getVim, settings } = ctx;

	/** Runs an edit, finishing the way vim would: out of visual mode, off the newline. */
	const edit = (
		id: string,
		name: string,
		make: (env: edits.EditEnv) => Edit,
		options: { atCursor?: boolean } = {},
	): VimActionDef => ({
		id,
		name,
		group: GROUP.lines,
		kind: "action",
		isEdit: true,
		run: (c) =>
			apply(c, make({ continueLists: settings().autoInsertListPrefix }), options.atCursor),
	});

	/**
	 * `atCursor` marks an edit that works from a position rather than a range.
	 * From visual mode that position is vim's cursor, which is not where
	 * CodeMirror's selection ends: a linewise selection ends at the line's end
	 * whatever column the cursor is in, and a characterwise one ends a
	 * character past it. Left alone, "delete to end of line" would find itself
	 * already at the end and delete the newline instead.
	 */
	const apply = (c: VimContext, run: Edit, atCursor = false): void => {
		const spec = run(atCursor && isVisual(c.cm) ? stateAtVimCursor(c) : c.view.state);
		if (spec) {
			commit(c, spec);
		}
	};

	/**
	 * Applies a spec the way a vim command would finish.
	 *
	 * From visual mode the selection ends: vim is taken out of visual mode
	 * first, and what remains is a cursor at the start of each range, as after
	 * `gU` or `d`. The spec was computed from the visual selection already, so
	 * leaving first cannot change what it does. In normal mode the cursor is
	 * kept off the newline.
	 */
	const commit = (c: VimContext, spec: TransactionSpec): void => {
		const vim = getVim();
		const wasVisual = isVisual(c.cm);
		if (vim && wasVisual) {
			vim.exitVisualMode(c.cm);
		}
		const { selection } = spec;
		const collapsed =
			wasVisual && selection instanceof EditorSelection
				? EditorSelection.create(
						selection.ranges.map((range) => EditorSelection.cursor(range.from)),
						selection.mainIndex,
					)
				: selection;
		c.view.dispatch({ ...spec, selection: collapsed, scrollIntoView: true });
		if (!isInsertLike(c.cm)) {
			keepOffNewline(c);
		}
	};

	const motion = (id: string, name: string, move: Move): VimActionDef => ({
		id,
		name,
		group: GROUP.cursor,
		kind: "motion",
		run: (c, args) => {
			const { doc } = c.view.state;
			const from = args.head
				? posToOffset(doc, args.head)
				: c.view.state.selection.main.head;
			return offsetToPos(doc, move(c.view.state, from, args.repeat));
		},
	});

	/** Extends or places the selection without going through vim's key handling. */
	const select = (id: string, name: string, make: () => Edit): VimActionDef => ({
		id,
		name,
		group: GROUP.selection,
		kind: "action",
		run: (c) => {
			const spec = make()(c.view.state);
			if (spec?.selection instanceof EditorSelection) {
				placeSelection(c.view, c.cm, spec.selection);
			}
		},
	});

	const headings = (): number[] => {
		const file = app.workspace.getActiveFile();
		const cache = file ? app.metadataCache.getFileCache(file) : null;
		return (cache?.headings ?? []).map((heading) => heading.position.start.line);
	};

	const actions: VimActionDef[] = [
		/* ----------------------------------------------------------- lines */
		edit("insertLineAbove", "Insert line above", edits.insertLineAbove),
		edit("insertLineBelow", "Insert line below", edits.insertLineBelow),
		edit("deleteLine", "Delete line", () => edits.deleteLine),
		edit("deleteToStartOfLine", "Delete to start of line", () => edits.deleteToStartOfLine, {
			atCursor: true,
		}),
		edit("deleteToEndOfLine", "Delete to end of line", () => edits.deleteToEndOfLine, {
			atCursor: true,
		}),
		edit("deleteWordBefore", "Delete word before cursor", () => edits.deleteWord("before")),
		edit("deleteWordAfter", "Delete word after cursor", () => edits.deleteWord("after")),
		edit("joinLines", "Join lines", () => edits.joinLines),
		edit("duplicateLine", "Duplicate line", () => edits.copyLines("down")),
		edit("copyLineUp", "Copy line up", () => edits.copyLines("up")),
		edit("copyLineDown", "Copy line down", () => edits.copyLines("down")),

		/* ---------------------------------------------------------- cursor */
		motion("goToLineStart", "Go to start of line", moves.lineStart),
		motion("goToLineEnd", "Go to end of line", moves.lineEnd),
		motion("goToNextLine", "Go to next line", moves.lineBelow),
		motion("goToPrevLine", "Go to previous line", moves.lineAbove),
		motion("goToFirstLine", "Go to first line", moves.documentStart),
		motion("goToLastLine", "Go to last line", moves.documentEnd),
		motion("goToNextChar", "Move cursor forward", moves.charForward),
		motion("goToPrevChar", "Move cursor backward", moves.charBackward),
		motion("moveCursorUp", "Move cursor up", moves.lineAbove),
		motion("moveCursorDown", "Move cursor down", moves.lineBelow),
		motion("goToPreviousWord", "Go to previous word", moves.wordBackward),
		motion("goToNextWord", "Go to next word", moves.wordForward),
		motion("goToNextHeading", "Go to next heading", moves.headingMove(headings, "next")),
		motion("goToPrevHeading", "Go to previous heading", moves.headingMove(headings, "previous")),
		goToLineNumber(app, (c, line) => {
			const { doc } = c.view.state;
			const offset = posToOffset(doc, { line, ch: 0 });
			c.view.dispatch({ selection: EditorSelection.cursor(offset), scrollIntoView: true });
		}),

		/* ------------------------------------------------------- selection */
		selectLine(getVim),
		select("selectToPreviousWord", "Select to previous word", () => edits.selectByWord("before")),
		select("selectToNextWord", "Select to next word", () => edits.selectByWord("after")),
		select("selectWordOrNextOccurrence", "Select word or next occurrence", () => edits.selectNextOccurrence),
		selectAllOccurrences(getVim),
		select("expandSelectionToBrackets", "Expand selection to brackets", () =>
			edits.expandToEnclosure("brackets"),
		),
		select("expandSelectionToQuotes", "Expand selection to quotes", () =>
			edits.expandToEnclosure("quotes"),
		),
		select("expandSelectionToQuotesOrBrackets", "Expand selection to quotes or brackets", () =>
			edits.expandToEnclosure("both"),
		),
		blockCursor(getVim, "insertCursorAbove", "Insert cursor above", "k"),
		blockCursor(getVim, "insertCursorBelow", "Insert cursor below", "j"),
		addCursorsToSelectionEnds(getVim),

		/* ------------------------------------------------------------ text */
		textAction("transformToUppercase", "Transform selection to uppercase", "upper", edit),
		textAction("transformToLowercase", "Transform selection to lowercase", "lower", edit),
		textAction("transformToTitlecase", "Transform selection to title case", "title", edit),
		textAction("toggleCase", "Toggle case of selection", "next", edit),

		/* ---------------------------------------------------------- editor */
		{
			id: "undo",
			name: "Undo",
			group: GROUP.editor,
			kind: "action",
			run: (c) => c.editor.undo(),
		},
		{
			id: "redo",
			name: "Redo",
			group: GROUP.editor,
			kind: "action",
			run: (c) => c.editor.redo(),
		},
		vaultToggle(app, "toggle-line-numbers", "Toggle line numbers", "showLineNumber", undefined),
		vaultToggle(app, "indent-using-tabs", "Indent using tabs", "useTab", true),
		vaultToggle(app, "indent-using-spaces", "Indent using spaces", "useTab", false),
	];

	return { actions };
}

/** The editor state with the selection collapsed to where vim's cursor is. */
function stateAtVimCursor(c: VimContext): EditorState {
	const { state } = c.view;
	const head = c.cm.state.vim?.sel?.head;
	if (!head) {
		return state;
	}
	const cursor = EditorSelection.cursor(posToOffset(state.doc, head));
	return state.update({ selection: cursor }).state;
}

/** Normal mode cannot rest on the newline; bring a cursor that landed there back. */
function keepOffNewline(c: VimContext): void {
	const { state } = c.view;
	const range = state.selection.main;
	if (!range.empty || state.selection.ranges.length !== 1) {
		return;
	}
	const clamped = clampToNormal(state.doc, range.head);
	if (clamped !== range.head) {
		c.view.dispatch({ selection: EditorSelection.cursor(clamped) });
	}
}

function textAction(
	id: string,
	name: string,
	transform: "upper" | "lower" | "title" | "next",
	edit: (id: string, name: string, make: () => Edit) => VimActionDef,
): VimActionDef {
	return { ...edit(id, name, () => edits.changeCase(transform)), group: GROUP.text };
}

function goToLineNumber(
	app: App,
	place: (c: VimContext, line: number) => void,
): VimActionDef {
	return {
		id: "goToLineNumber",
		name: "Go to line number",
		group: GROUP.cursor,
		kind: "action",
		run: (c) => {
			new GoToLineModal(app, c.view.state.doc.lines, (line) => place(c, line)).open();
		},
	};
}

/**
 * Selects the line, linewise: `V`, and one more line each time it is run again.
 * Outside vim's normal and visual modes there is no linewise mode, so the
 * line is selected as plain text.
 */
function selectLine(getVim: ModuleContext["getVim"]): VimActionDef {
	return {
		id: "selectLine",
		name: "Select line",
		group: GROUP.selection,
		kind: "action",
		run: (c) => {
			const vim = getVim();
			if (!vim || isInsertLike(c.cm)) {
				const spec = edits.selectLines(c.view.state);
				if (spec?.selection instanceof EditorSelection) {
					placeSelection(c.view, c.cm, spec.selection);
				}
				return;
			}
			if (c.mode === "visual-line") {
				vim.handleKey(c.cm, "j", "user");
				return;
			}
			if (isVisual(c.cm)) {
				vim.exitVisualMode(c.cm);
			}
			vim.handleKey(c.cm, "V", "user");
		},
	};
}

/**
 * Vim has one selection, so "select every occurrence" becomes vim's own answer
 * to it: search for the word, which highlights every match and lets `n`, or
 * `cgn` followed by `.`, walk through them.
 *
 * The word is the one under the cursor, or at the start of the selection.
 */
function selectAllOccurrences(getVim: ModuleContext["getVim"]): VimActionDef {
	return {
		id: "selectAllOccurrences",
		name: "Select all occurrences",
		group: GROUP.selection,
		kind: "action",
		run: (c) => {
			const vim = getVim();
			if (!vim) {
				return;
			}
			const { state } = c.view;
			const anchor = state.selection.main.from;
			const line = state.doc.lineAt(anchor);
			const [start, end] = wordRangeAt(line.text, anchor - line.from);
			if (start === end) {
				return;
			}
			if (isVisual(c.cm)) {
				vim.exitVisualMode(c.cm);
			}
			// `*` searches for the word under the cursor, wherever in it.
			c.view.dispatch({ selection: EditorSelection.cursor(line.from + start) });
			vim.handleKey(c.cm, "*", "user");
		},
	};
}

/**
 * "Add a cursor above/below" as visual-block mode: one block, a cursor on
 * every line it covers, edited together with `I`, `A` or `c`.
 */
function blockCursor(
	getVim: ModuleContext["getVim"],
	id: string,
	name: string,
	key: "j" | "k",
): VimActionDef {
	return {
		id,
		name,
		group: GROUP.selection,
		kind: "action",
		run: (c) => {
			const vim = getVim();
			if (!vim) {
				return;
			}
			if (c.mode !== "visual-block") {
				if (isInsertLike(c.cm)) {
					vim.exitInsertMode(c.cm);
				} else if (isVisual(c.cm)) {
					vim.exitVisualMode(c.cm);
				}
				vim.handleKey(c.cm, "<C-v>", "user");
			}
			vim.handleKey(c.cm, key, "user");
		},
	};
}

/**
 * A cursor at the end of every selected line, ready to type: visual-block
 * mode over the lines, then `$A`.
 */
function addCursorsToSelectionEnds(getVim: ModuleContext["getVim"]): VimActionDef {
	return {
		id: "addCursorsToSelectionEnds",
		name: "Add cursors to selection ends",
		group: GROUP.selection,
		kind: "action",
		run: (c) => {
			const vim = getVim();
			const range = c.view.state.selection.main;
			if (!vim || range.empty) {
				return;
			}
			const { doc } = c.view.state;
			const first = doc.lineAt(range.from);
			let last = doc.lineAt(range.to);
			if (last.number > first.number && range.to === last.from) {
				last = doc.line(last.number - 1);
			}
			if (isInsertLike(c.cm)) {
				vim.exitInsertMode(c.cm);
			} else if (isVisual(c.cm)) {
				vim.exitVisualMode(c.cm);
			}
			c.view.dispatch({ selection: EditorSelection.cursor(first.from) });
			vim.handleKey(c.cm, "<C-v>", "user");
			if (last.number > first.number) {
				// By line number rather than `j`, which would count wrapped lines.
				for (const digit of String(last.number)) {
					vim.handleKey(c.cm, digit, "user");
				}
				vim.handleKey(c.cm, "G", "user");
			}
			vim.handleKey(c.cm, "$", "user");
			vim.handleKey(c.cm, "A", "user");
		},
	};
}

function vaultToggle(
	app: App,
	id: string,
	name: string,
	setting: "showLineNumber" | "useTab",
	value: boolean | undefined,
): VimActionDef {
	const vault = app.vault as unknown as {
		getConfig(key: string): unknown;
		setConfig(key: string, value: unknown): void;
	};
	return {
		id,
		name,
		group: GROUP.editor,
		kind: "action",
		needsEditor: false,
		run: () => {
			vault.setConfig(setting, value ?? !vault.getConfig(setting));
		},
	};
}

export const editorShortcutsModule: FeatureModule = {
	id: "editor-shortcuts",
	title: "Editor Shortcuts commands, made vim-aware",
	create: (ctx) => ({ contribution: editorShortcutsContribution(ctx) }),
};
