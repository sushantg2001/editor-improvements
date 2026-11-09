import { afterEach, describe, expect, it, vi } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";
import type { VimApi } from "../../../src/types";

/**
 * The key sequences the block-cursor and line-selection commands send to vim,
 * checked against a recording stand-in. The effect of each sequence is vim's
 * own, but vim's vertical motions need a layout engine, which the test
 * environment does not have.
 */

afterEach(() => {
	vimApi.mapclear();
});

function recorder() {
	const keys: string[] = [];
	const vim = {
		handleKey: vi.fn((_cm: unknown, key: string) => {
			keys.push(key);
		}),
		exitVisualMode: vi.fn(),
		exitInsertMode: vi.fn(),
	} as unknown as VimApi;
	return { vim, keys };
}

const DOC = "alpha bravo\ncharlie delta\necho";

describe("selectLine", () => {
	it("extends a linewise selection by one more line", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("gl", "selectLine");
		press(t.cm, "V");

		press(t.cm, "g", "l");

		expect(keys).toEqual(["j"]);
	});

	it("selects the whole line as text in insert mode, where there is no linewise mode", async () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("<C-l>", "selectLine", ["insert"]);
		press(t.cm, "i");

		press(t.cm, "<C-l>");
		await Promise.resolve();

		expect(keys).toEqual([]);
		expect(t.selection()).toEqual({ anchor: 0, head: 12 });
	});
});

describe("insertCursorBelow and insertCursorAbove", () => {
	it("leave insert mode, start a block and extend it", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("<C-j>", "insertCursorBelow", ["insert"]);
		press(t.cm, "i");

		press(t.cm, "<C-j>");

		expect(vim.exitInsertMode).toHaveBeenCalledOnce();
		expect(keys).toEqual(["<C-v>", "j"]);
	});

	it("leave a plain visual selection before starting the block", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("gk", "insertCursorAbove");
		press(t.cm, "G", "v");

		press(t.cm, "g", "k");

		expect(vim.exitVisualMode).toHaveBeenCalledOnce();
		expect(keys).toEqual(["<C-v>", "k"]);
	});

	it("only extend a block that is already there", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("gj", "insertCursorBelow");
		press(t.cm, "<C-v>");

		press(t.cm, "g", "j");

		expect(keys).toEqual(["j"]);
	});
});

describe("addCursorsToSelectionEnds", () => {
	it("starts a block at the first line, runs it to the last line number, and appends", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("ga", "addCursorsToSelectionEnds");
		press(t.cm, "V", "3", "G");

		press(t.cm, "g", "a");

		expect(keys).toEqual(["<C-v>", "3", "G", "$", "A"]);
		expect(t.cursor()).toBe(0);
	});

	it("types a multi-digit line number one key at a time", () => {
		const { vim, keys } = recorder();
		const doc = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
		const t = moduleHarness(editorShortcutsModule, doc, { vim });
		t.bind("ga", "addCursorsToSelectionEnds");
		press(t.cm, "V", "1", "2", "G");

		press(t.cm, "g", "a");

		expect(keys).toEqual(["<C-v>", "1", "2", "G", "$", "A"]);
	});

	it("skips the line number for a selection inside one line", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("ga", "addCursorsToSelectionEnds");
		press(t.cm, "v", "l");

		press(t.cm, "g", "a");

		expect(keys).toEqual(["<C-v>", "$", "A"]);
	});

	it("does not count a line the selection only reaches the start of", () => {
		const { vim, keys } = recorder();
		const t = moduleHarness(editorShortcutsModule, DOC, { vim });
		t.bind("ga", "addCursorsToSelectionEnds");
		press(t.cm, "V");
		t.view.dispatch({ selection: { anchor: 0, head: 12 } });

		press(t.cm, "g", "a");

		expect(keys).toEqual(["<C-v>", "$", "A"]);
	});
});

describe("commands with vim unavailable", () => {
	it("do nothing rather than throw", () => {
		const t = moduleHarness(editorShortcutsModule, DOC, { vim: null as never });

		expect(() => {
			t.invoke("insertCursorBelow");
			t.invoke("addCursorsToSelectionEnds");
			t.invoke("selectAllOccurrences");
		}).not.toThrow();
	});
});

describe("keys the commands send to vim are not recorded into macros", () => {
	// Recording `gl` for `selectLine` must store `gl`, not `glV`: replaying that
	// would run the command, which sends V, and then press V again.
	const recorded = (setup: (t: ReturnType<typeof moduleHarness>) => void, keys: string[]) => {
		const t = moduleHarness(editorShortcutsModule, "alpha bravo\ncharlie\ndelta");
		setup(t);
		press(t.cm, "q", "a", ...keys, "<Esc>", "q");
		return vimApi.getRegisterController().getRegister("a").toString();
	};

	it("selectLine", () => {
		expect(recorded((t) => t.bind("gl", "selectLine"), ["g", "l"])).toBe("gl<Esc>");
	});

	it("insertCursorBelow", () => {
		expect(recorded((t) => t.bind("gj", "insertCursorBelow"), ["g", "j"])).toBe("gj<Esc>");
	});

	it("addCursorsToSelectionEnds", () => {
		expect(
			recorded((t) => t.bind("ga", "addCursorsToSelectionEnds"), ["V", "2", "G", "g", "a"]),
		).toBe("V2Gga"); // it ends in insert mode, whose own <Esc> vim does not log here
	});

	it("selectAllOccurrences", () => {
		expect(recorded((t) => t.bind("g*", "selectAllOccurrences"), ["g", "*"])).toBe("g*<Esc>");
	});
});
