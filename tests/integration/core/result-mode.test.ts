import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, modeOf, press, vimApi } from "../../helpers/vim";
import type { VimActionDef } from "../../../src/types";

afterEach(() => {
	vimApi.mapclear();
});

function run(setup: (cm: ReturnType<typeof makeEditor>["cm"]) => void, resultMode: "insert" | "normal") {
	const editor = makeEditor("alpha bravo\ncharlie");
	const registry = new ActionRegistry();
	const def: VimActionDef = {
		id: "probe",
		name: "probe",
		group: "Test",
		kind: "action",
		resultMode,
		run: () => {},
	};
	registry.set("test", { actions: [def] });
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);

	setup(editor.cm);
	dispatcher.invoke("probe", editor.cm);
	return editor.cm;
}

describe("resultMode against the real Vim API", () => {
	it("enters insert mode from normal mode", () => {
		const cm = run(() => {}, "insert");

		expect(modeOf(cm)).toBe("insert");
	});

	it.each([
		["v", "visual"],
		["V", "visual line"],
		["<C-v>", "visual block"],
	])("enters insert mode from %s (%s) instead of reading i as a text object", (key) => {
		const cm = run((c) => press(c, key, "l"), "insert");

		expect(modeOf(cm)).toBe("insert");
	});

	it("leaves insert mode alone when already there", () => {
		const cm = run((c) => press(c, "i"), "insert");

		expect(modeOf(cm)).toBe("insert");
	});

	it.each([
		["v", "visual"],
		["V", "visual line"],
		["<C-v>", "visual block"],
	])("returns to normal mode from %s (%s)", (key) => {
		const cm = run((c) => press(c, key, "l"), "normal");

		expect(modeOf(cm)).toBe("normal");
	});
});
