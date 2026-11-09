import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ActionRegistry } from "../../../src/core/registry";
import { makeEditor, press, vimApi } from "../../helpers/vim";
import type { VimActionDef } from "../../../src/types";

afterEach(() => {
	vimApi.mapclear();
});

function harness(doc = "alpha bravo\ncharlie") {
	const editor = makeEditor(doc);
	const registry = new ActionRegistry();
	const dispatcher = new VimDispatcher({} as never, registry, () => editor.ctx, () => vimApi);
	const ledger = new MappingLedger();
	const reapply = () => ledger.apply(vimApi, dispatcher, resolveBindings(registry).bindings);
	return { ...editor, registry, reapply };
}

function def(kind: VimActionDef["kind"], extra: Partial<VimActionDef> = {}): VimActionDef {
	return {
		id: "thing",
		name: "thing",
		group: "Test",
		kind,
		defaultKeys: [{ keys: "gz", contexts: ["normal"] }],
		run: () => {},
		...extra,
	};
}

describe("changing what kind of thing an id is, as editing a script does", () => {
	it("an action that becomes a motion still moves the cursor", () => {
		const t = harness();
		t.registry.set("script:init.js", { actions: [def("action")] });
		t.reapply();
		press(t.cm, "g", "z");

		t.registry.set("script:init.js", { actions: [def("motion", { run: () => ({ line: 1, ch: 3 }) })] });
		t.reapply();
		press(t.cm, "g", "z");

		expect(t.view.state.selection.main.head).toBe("alpha bravo\n".length + 3);
	});

	it("a motion that becomes an action still runs", () => {
		const t = harness();
		let ran = 0;
		t.registry.set("script:init.js", { actions: [def("motion", { run: () => ({ line: 0, ch: 2 }) })] });
		t.reapply();
		press(t.cm, "g", "z");
		expect(t.view.state.selection.main.head).toBe(2);

		t.registry.set("script:init.js", { actions: [def("action", { run: () => void ran++ })] });
		t.reapply();
		press(t.cm, "g", "z");

		expect(ran).toBe(1);
	});

	it("an action that becomes an operator is called as an operator", () => {
		const t = harness();
		let seen: unknown;
		t.registry.set("script:init.js", { actions: [def("action")] });
		t.reapply();
		press(t.cm, "g", "z");

		t.registry.set("script:init.js", {
			actions: [def("operator", { run: (_c, args) => void (seen = args.range) })],
		});
		t.reapply();
		press(t.cm, "g", "z", "w");

		expect(seen).toBeDefined();
	});
});
