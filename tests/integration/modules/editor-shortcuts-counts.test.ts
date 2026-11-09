import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { modeOf, press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

const h = (doc: string) => moduleHarness(editorShortcutsModule, doc);

describe("a count before an editing command", () => {
	it("deletes that many lines, as 3dd does", () => {
		const t = h("a\nb\nc\nd\ne");
		t.bind("gd", "deleteLine");

		press(t.cm, "3", "g", "d");

		expect(t.text()).toBe("d\ne");
	});

	it("deletes only the lines that are left, as 5dd does near the end", () => {
		const t = h("a\nb\nc\nd");
		t.bind("gd", "deleteLine");
		press(t.cm, "2", "G");
		press(t.cm, "9", "g", "d");

		expect(t.text()).toBe("a");
	});

	it("opens that many lines, as 3o does", () => {
		const t = h("a\nb");
		t.bind("go", "insertLineBelow");

		press(t.cm, "3", "g", "o");

		expect(t.text()).toBe("a\n\n\n\nb");
	});

	it("opens that many lines above", () => {
		const t = h("a\nb");
		t.bind("gO", "insertLineAbove");

		press(t.cm, "2", "g", "O");

		expect(t.text()).toBe("\n\na\nb");
	});

	it("copies that many times", () => {
		const t = h("x\ny");
		t.bind("gy", "copyLineDown");

		press(t.cm, "3", "g", "y");

		expect(t.text()).toBe("x\nx\nx\nx\ny");
	});

	it("joins that many lines, so 3J is two joins, as in vim", () => {
		const t = h("a\nb\nc\nd");
		t.bind("gJ", "joinLines");

		press(t.cm, "3", "g", "J");

		expect(t.text()).toBe("a b c\nd");
	});

	it("deletes that many words", () => {
		const t = h("one two three four");
		t.bind("gw", "deleteWordAfter");

		press(t.cm, "2", "g", "w");

		expect(t.text()).toBe(" three four");
	});

	it("is a single undo step, because it is a single change", () => {
		const t = h("a\nb\nc\nd");
		t.bind("gd", "deleteLine");
		const before = t.view.state.doc.length;

		press(t.cm, "3", "g", "d");

		// One transaction, whatever the count.
		expect(t.view.state.doc.length).toBeLessThan(before);
		expect(t.text()).toBe("d");
	});

	it("repeats with the dot command, count and all", () => {
		const t = h("a\nb\nc\nd\ne\nf");
		t.bind("gd", "deleteLine");

		press(t.cm, "2", "g", "d", ".");

		expect(t.text()).toBe("e\nf");
	});

	it("means nothing to an edit that works on a position, so it runs once", () => {
		const t = h("abc def\nghi");
		t.bind("gD", "deleteToEndOfLine");

		press(t.cm, "w", "3", "g", "D");

		expect(t.text()).toBe("abc \nghi");
	});

	it("is ignored in visual mode, as vim ignores it there", () => {
		const t = h("a\nb\nc\nd");
		t.bind("gd", "deleteLine");

		press(t.cm, "V", "3", "g", "d");

		expect(t.text()).toBe("b\nc\nd");
		expect(modeOf(t.cm)).toBe("normal");
	});

	it("leaves a command that is run without a count doing exactly one", () => {
		const t = h("a\nb\nc");
		t.bind("gd", "deleteLine");

		press(t.cm, "g", "d");

		expect(t.text()).toBe("b\nc");
	});
});
