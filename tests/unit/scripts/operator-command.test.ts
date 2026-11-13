import { describe, expect, it } from "vitest";

import { createScriptApi } from "../../../src/scripts/api";
import { App } from "../../mocks/obsidian";

function define() {
	const { api, contribution } = createScriptApi({
		app: new App() as never,
		getVim: () => null,
		leader: "\\",
		knowsAction: () => false,
	});
	return { api, actions: () => contribution.actions ?? [] };
}

describe("which script actions become palette commands", () => {
	// An operator acts on the range a motion gives it. Run from the palette there
	// is no range, so an operator written for one would fail every time.
	it("leaves an operator out of the palette unless asked", () => {
		const t = define();

		t.api.operator("shout", () => {});

		expect(t.actions()[0]?.command).toBe(false);
	});

	it("puts an operator in the palette when the script insists", () => {
		const t = define();

		t.api.operator("shout", () => {}, { command: true });

		expect(t.actions()[0]?.command).toBe(true);
	});

	it("keeps an action and a motion in the palette by default", () => {
		const t = define();

		t.api.action("a", () => {});
		t.api.motion("m", () => ({ line: 0, ch: 0 }));

		expect(t.actions().map((a) => a.command)).toEqual([undefined, undefined]);
	});
});
