import { afterEach, describe, expect, it } from "vitest";

import { editorShortcutsModule } from "../../../src/modules/editor-shortcuts";
import { moduleHarness } from "../../helpers/modules";
import { press, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

const h = (doc: string) => moduleHarness(editorShortcutsModule, doc);

describe("opening a line in an ordered list that has sub-items", () => {
	it("below an item numbers the items after its sub-list", () => {
		const t = h("1. a\n   - x\n2. b\n3. c");
		t.bind("go", "insertLineBelow");

		press(t.cm, "g", "o");

		expect(t.text()).toBe("1. a\n2. \n   - x\n3. b\n4. c");
	});

	it("above an item numbers every item from there on", () => {
		const t = h("1. a\n   1. x\n   2. y\n2. b\n3. c");
		t.bind("gO", "insertLineAbove");
		press(t.cm, "3", "G");

		press(t.cm, "g", "O");

		expect(t.text()).toBe("1. a\n   1. x\n   2. \n   3. y\n2. b\n3. c");
	});

	it("goes past a blank line between items", () => {
		const t = h("1. a\n\n2. b");
		t.bind("go", "insertLineBelow");

		press(t.cm, "g", "o");

		expect(t.text()).toBe("1. a\n2. \n\n3. b");
	});

	it("does not touch the number at the start of a following paragraph", () => {
		const t = h("1. a\n3.14 is pi");
		t.bind("go", "insertLineBelow");

		press(t.cm, "g", "o");

		expect(t.text()).toBe("1. a\n2. \n3.14 is pi");
	});
});
