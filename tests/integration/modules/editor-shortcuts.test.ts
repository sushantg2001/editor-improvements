import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { modeOf, press, vimApi } from "../../helpers/vim";

/**
 * The Editor Shortcuts port against real CodeMirror with the real vim addon.
 *
 * One limit of the test environment: happy-dom has no layout, so vim's `j` and
 * `k` jump to the end of the document. Tests here use `gg`, `G` and counted
 * `G` to move between lines instead.
 */

afterEach(() => {
	vimApi.mapclear();
});

/** Vim picks up a selection made inside a key one microtask later. */
const settle = () => Promise.resolve();

const DOC = "alpha bravo\ncharlie delta\necho";
const h = (doc = DOC, settings = {}) => moduleHarness(editorShortcutsModule, doc, { settings });

describe("the module", () => {
	it("ports every Editor Shortcuts command under its original id", () => {
		const t = h();

		expect(
			t.registry
				.actions()
				.map((a) => a.id)
				.sort(),
		).toEqual(
			[
				"addCursorsToSelectionEnds",
				"copyLineDown",
				"copyLineUp",
				"deleteLine",
				"deleteToEndOfLine",
				"deleteToStartOfLine",
				"deleteWordAfter",
				"deleteWordBefore",
				"duplicateLine",
				"expandSelectionToBrackets",
				"expandSelectionToQuotes",
				"expandSelectionToQuotesOrBrackets",
				"goToFirstLine",
				"goToLastLine",
				"goToLineEnd",
				"goToLineNumber",
				"goToLineStart",
				"goToNextChar",
				"goToNextHeading",
				"goToNextLine",
				"goToNextWord",
				"goToPrevChar",
				"goToPrevHeading",
				"goToPrevLine",
				"goToPreviousWord",
				"indent-using-spaces",
				"indent-using-tabs",
				"insertCursorAbove",
				"insertCursorBelow",
				"insertLineAbove",
				"insertLineBelow",
				"joinLines",
				"moveCursorDown",
				"moveCursorUp",
				"redo",
				"selectAllOccurrences",
				"selectLine",
				"selectToNextWord",
				"selectToPreviousWord",
				"selectWordOrNextOccurrence",
				"toggle-line-numbers",
				"toggleCase",
				"transformToLowercase",
				"transformToTitlecase",
				"transformToUppercase",
				"undo",
			].sort(),
		);
	});

	it("binds no keys of its own", () => {
		const t = h();

		expect(t.registry.bindings()).toEqual([]);
	});
});

describe("motions driven by vim keys", () => {
	it("move the cursor", () => {
		const t = h();
		t.bind("gw", "goToNextWord");

		press(t.cm, "g", "w");

		expect(t.cursor()).toBe(5);
	});

	it("rest on the last character in normal mode, not on the newline", () => {
		const t = h();
		t.bind("gL", "goToLineEnd");

		press(t.cm, "g", "L");

		expect(t.cursor()).toBe(10);
	});

	it("compose with an operator: d + the motion deletes up to it", () => {
		const t = h();
		t.bind("gw", "goToNextWord");

		press(t.cm, "d", "g", "w");

		expect(t.text()).toBe(" bravo\ncharlie delta\necho");
	});

	it("reach the end of the line under an operator", () => {
		const t = h();
		t.bind("gL", "goToLineEnd");
		press(t.cm, "w");

		press(t.cm, "d", "g", "L");

		expect(t.text()).toBe("alpha \ncharlie delta\necho");
	});

	it("take a count", () => {
		const t = h("one two three four");
		t.bind("gw", "goToNextWord");

		press(t.cm, "2", "g", "w");

		expect(t.cursor()).toBe(7);
	});

	it("extend a visual selection", () => {
		const t = h();
		t.bind("gw", "goToNextWord");

		press(t.cm, "v", "g", "w", "d");

		expect(t.text()).toBe("bravo\ncharlie delta\necho");
	});

	it("reach backwards under an operator", () => {
		const t = h();
		t.bind("gF", "goToFirstLine");
		press(t.cm, "G");

		press(t.cm, "d", "g", "F");

		expect(t.text()).toBe("echo");
	});
});

describe("motions under operators", () => {
	it("repeat with the dot command", () => {
		const t = h("one two three four five");
		t.bind("gw", "goToNextWord");

		press(t.cm, "d", "g", "w", ".", ".");

		expect(t.text()).toBe(" four five");
	});

	it("take a count after the operator", () => {
		const t = h("one two three four five");
		t.bind("gw", "goToNextWord");

		press(t.cm, "d", "2", "g", "w");

		expect(t.text()).toBe(" three four five");
	});

	it("yank, so the text can be pasted", () => {
		const t = h("one two");
		t.bind("gw", "goToNextWord");

		press(t.cm, "y", "g", "w", "$", "p");

		expect(t.text()).toBe("one twoone");
	});

	it("change, which leaves vim in insert mode", () => {
		const t = h("one two");
		t.bind("gw", "goToNextWord");

		press(t.cm, "c", "g", "w");

		expect(modeOf(t.cm)).toBe("insert");
		expect(t.text()).toBe(" two");
	});
});

describe("motions run from the palette", () => {
	it("place the cursor", () => {
		const t = h();

		t.invoke("goToNextWord");

		expect(t.cursor()).toBe(5);
		expect(modeOf(t.cm)).toBe("normal");
	});

	it("extend the selection in visual mode, so a following operator sees it", () => {
		const t = h();
		press(t.cm, "v");

		t.invoke("goToNextWord");
		press(t.cm, "d");

		expect(t.text()).toBe("bravo\ncharlie delta\necho");
	});

	it("go line by line, keeping the column", () => {
		const t = h();
		press(t.cm, "l", "l");

		t.invoke("goToNextLine");

		expect(t.cursor()).toBe(14);
	});

	it("land on the line end in insert mode, where the cursor may rest past the last character", () => {
		const t = h();
		press(t.cm, "i");

		t.invoke("goToLineEnd");

		expect(t.cursor()).toBe(11);
	});

	it("go to the last line's end", () => {
		const t = h();

		t.invoke("goToLastLine");

		expect(t.cursor()).toBe(DOC.length - 1);
	});
});

describe("headings", () => {
	it("jump between the headings the metadata cache lists", () => {
		const t = h("# one\ntext\n## two\nmore\n### three");
		const file = {};
		t.app.workspace.activeFile = file;
		t.app.metadataCache.headings.set(file, [0, 2, 4]);
		t.bind("]]", "goToNextHeading");
		t.bind("[[", "goToPrevHeading");

		press(t.cm, "]", "]");
		expect(t.cursor()).toBe("# one\ntext\n## two".length - 1);

		press(t.cm, "]", "]");
		expect(t.cursor()).toBe(t.text().length - 1);

		press(t.cm, "[", "[");
		expect(t.cursor()).toBe("# one\ntext\n## two".length - 1);
	});

	it("stay put when the file has no cache", () => {
		const t = h("# one\ntext");
		t.app.workspace.activeFile = {};
		t.bind("]]", "goToNextHeading");

		press(t.cm, "]", "]");

		expect(t.cursor()).toBe(t.text().length - 1);
	});
});

describe("editing in normal mode", () => {
	it("deleteLine removes the line and lands on the next one", () => {
		const t = h();
		t.bind("gd", "deleteLine");

		press(t.cm, "l", "l", "g", "d");

		expect(t.text()).toBe("charlie delta\necho");
		expect(t.cursor()).toBe(2);
		expect(modeOf(t.cm)).toBe("normal");
	});

	it("insertLineBelow opens a line and stays in normal mode", () => {
		const t = h();
		t.bind("go", "insertLineBelow");

		press(t.cm, "g", "o");

		expect(t.text()).toBe("alpha bravo\n\ncharlie delta\necho");
		expect(t.cursor()).toBe(12);
		expect(modeOf(t.cm)).toBe("normal");
	});

	it("insertLineBelow continues a list unless the setting is off", () => {
		const on = h("- a");
		on.bind("go", "insertLineBelow");
		press(on.cm, "g", "o");
		expect(on.text()).toBe("- a\n- ");

		vimApi.mapclear();
		const off = h("- a", { autoInsertListPrefix: false });
		off.bind("go", "insertLineBelow");
		press(off.cm, "g", "o");
		expect(off.text()).toBe("- a\n");
	});

	it("deleteToEndOfLine keeps the cursor on the last character", () => {
		const t = h();
		t.bind("gD", "deleteToEndOfLine");
		press(t.cm, "w");

		press(t.cm, "g", "D");

		expect(t.text()).toBe("alpha \ncharlie delta\necho");
		expect(t.cursor()).toBe(5);
	});

	it("joinLines joins the next line on", () => {
		const t = h();
		t.bind("gJ", "joinLines");

		press(t.cm, "g", "J");

		expect(t.text()).toBe("alpha bravo charlie delta\necho");
	});

	it("copyLineDown duplicates the line", () => {
		const t = h();
		t.bind("gy", "copyLineDown");

		press(t.cm, "g", "y");

		expect(t.text()).toBe("alpha bravo\nalpha bravo\ncharlie delta\necho");
	});

	it("changes the case of the word under the cursor", () => {
		const t = h();
		t.bind("gU", "transformToUppercase");

		press(t.cm, "g", "U");

		expect(t.text()).toBe("ALPHA bravo\ncharlie delta\necho");
		expect(modeOf(t.cm)).toBe("normal");
	});

	it("undo and redo run on the editor", () => {
		const t = h();
		t.bind("gu", "undo");
		t.bind("gr", "redo");

		press(t.cm, "g", "u", "g", "r");

		expect(t.fakeEditor.undo).toHaveBeenCalledOnce();
		expect(t.fakeEditor.redo).toHaveBeenCalledOnce();
	});
});

describe("repeating an edit with the dot command", () => {
	it("deleteLine runs again on the next line", () => {
		const t = h("a\nb\nc\nd");
		t.bind("gd", "deleteLine");

		press(t.cm, "g", "d", ".");

		expect(t.text()).toBe("c\nd");
	});

	it("insertLineBelow opens another line", () => {
		const t = h("a\nb");
		t.bind("go", "insertLineBelow");

		press(t.cm, "g", "o", ".");

		expect(t.text()).toBe("a\n\n\nb");
	});

	it("changeCase repeats on the next word", () => {
		const t = h("one two");
		t.bind("gU", "transformToUppercase");

		press(t.cm, "g", "U", "w", ".");

		expect(t.text()).toBe("ONE TWO");
	});

	it("does not repeat a motion or a selection, which are not changes", () => {
		const t = h("a\nb\nc");
		t.bind("gd", "deleteLine");
		t.bind("gl", "goToLineEnd");

		press(t.cm, "g", "d", "g", "l", ".");

		expect(t.text()).toBe("c");
	});
});

describe("editing from visual mode", () => {
	it("deleteLine takes every selected line and returns to normal mode", () => {
		const t = h();
		t.bind("gd", "deleteLine");
		press(t.cm, "V", "2", "G");

		press(t.cm, "g", "d");

		expect(t.text()).toBe("echo");
		expect(modeOf(t.cm)).toBe("normal");
		expect(t.view.state.selection.main.empty).toBe(true);
	});

	it("transformToUppercase changes the selection and leaves a cursor at its start", () => {
		const t = h();
		t.bind("gU", "transformToUppercase");

		press(t.cm, "w", "v", "e", "g", "U");

		expect(t.text()).toBe("alpha BRAVO\ncharlie delta\necho");
		expect(modeOf(t.cm)).toBe("normal");
		expect(t.view.state.selection.main.empty).toBe(true);
		expect(t.cursor()).toBe(6);
	});

	it("joinLines joins every selected line", () => {
		const t = h();
		t.bind("gJ", "joinLines");
		press(t.cm, "V", "3", "G");

		press(t.cm, "g", "J");

		expect(t.text()).toBe("alpha bravo charlie delta echo");
		expect(modeOf(t.cm)).toBe("normal");
	});
});

describe("editing from insert mode", () => {
	it("stays in insert mode", () => {
		const t = h();
		t.bind("<C-o>", "insertLineBelow", ["insert"]);
		press(t.cm, "i");

		press(t.cm, "<C-o>");

		expect(modeOf(t.cm)).toBe("insert");
		expect(t.text()).toBe("alpha bravo\n\ncharlie delta\necho");
	});
});

describe("selections", () => {
	it("selectWordOrNextOccurrence selects the word, which vim sees as visual mode", async () => {
		const t = h("foo bar foo baz foo");
		t.bind("gn", "selectWordOrNextOccurrence");

		press(t.cm, "g", "n");
		await settle();

		expect(modeOf(t.cm)).toBe("visual");
		expect(t.selection()).toEqual({ anchor: 0, head: 3 });
	});

	it("selectWordOrNextOccurrence then moves to the next occurrence, ready for an operator", async () => {
		const t = h("foo bar foo baz foo");
		t.bind("gn", "selectWordOrNextOccurrence");

		press(t.cm, "g", "n");
		await settle();
		press(t.cm, "g", "n");
		await settle();
		press(t.cm, "d");

		expect(t.text()).toBe("foo bar  baz foo");
	});

	it("selectToNextWord starts a visual selection from normal mode", async () => {
		const t = h();
		t.bind("gs", "selectToNextWord");

		press(t.cm, "g", "s");
		await settle();
		press(t.cm, "d");

		expect(t.text()).toBe(" bravo\ncharlie delta\necho");
	});

	it("expandSelectionToBrackets selects inside, then including, the brackets", async () => {
		const t = h("f(a, b)");
		t.bind("gb", "expandSelectionToBrackets");
		press(t.cm, "l", "l", "l");

		press(t.cm, "g", "b");
		await settle();
		expect(t.selection()).toEqual({ anchor: 2, head: 6 });

		press(t.cm, "g", "b");
		await settle();
		expect(t.selection()).toEqual({ anchor: 1, head: 7 });
	});

	it("selectLine starts linewise visual mode", () => {
		const t = h();
		t.bind("gl", "selectLine");

		press(t.cm, "g", "l");

		expect(modeOf(t.cm)).toBe("visual line");
		expect(t.selection()).toEqual({ anchor: 0, head: 11 });
	});

	it("selectLine from a characterwise selection switches to linewise", () => {
		const t = h();
		t.bind("gl", "selectLine", ["normal", "visual"]);
		press(t.cm, "v", "l");

		press(t.cm, "g", "l");

		expect(modeOf(t.cm)).toBe("visual line");
	});

	it("selectAllOccurrences searches for the word, so n walks the matches", () => {
		const t = h("foo bar foo baz foo");
		t.bind("g*", "selectAllOccurrences");

		press(t.cm, "g", "*");
		expect(t.cursor()).toBe(8);

		press(t.cm, "n");
		expect(t.cursor()).toBe(16);
	});

	it("insertCursorBelow starts a visual block, where one edit reaches every line", () => {
		const t = h();
		t.bind("gj", "insertCursorBelow");

		press(t.cm, "g", "j");

		expect(modeOf(t.cm)).toBe("visual block");
	});

	it("insertCursorAbove does the same", () => {
		const t = h();
		t.bind("gk", "insertCursorAbove");
		press(t.cm, "G");

		press(t.cm, "g", "k");

		expect(modeOf(t.cm)).toBe("visual block");
	});

	it("addCursorsToSelectionEnds appends at the end of every selected line", () => {
		const t = h();
		t.bind("ga", "addCursorsToSelectionEnds");
		press(t.cm, "V", "2", "G");

		press(t.cm, "g", "a");

		expect(modeOf(t.cm)).toBe("insert");
		expect(t.cursor()).toBe(11);
	});

	it("addCursorsToSelectionEnds ignores an empty selection", () => {
		const t = h();
		t.bind("ga", "addCursorsToSelectionEnds");

		press(t.cm, "g", "a");

		expect(modeOf(t.cm)).toBe("normal");
	});
});

describe("vault toggles", () => {
	it("toggle line numbers flips the setting", () => {
		const t = h();
		t.bind("gn", "toggle-line-numbers");

		t.invoke("toggle-line-numbers");
		expect(t.app.vault.getConfig("showLineNumber")).toBe(true);

		t.invoke("toggle-line-numbers");
		expect(t.app.vault.getConfig("showLineNumber")).toBe(false);
	});

	it("sets tabs or spaces explicitly", () => {
		const t = h();

		t.invoke("indent-using-tabs");
		expect(t.app.vault.getConfig("useTab")).toBe(true);

		t.invoke("indent-using-spaces");
		expect(t.app.vault.getConfig("useTab")).toBe(false);
	});
});
