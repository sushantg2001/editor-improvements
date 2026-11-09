import { afterEach, describe, expect, it } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { MappingLedger, resolveBindings } from "../../../src/core/keymap";
import { ModuleHost } from "../../../src/core/modules";
import { ActionRegistry } from "../../../src/core/registry";
import { MODULES } from "../../../src/modules";
import { App } from "../../mocks/obsidian";
import { makeEditor, vimApi } from "../../helpers/vim";

afterEach(() => {
	vimApi.mapclear();
});

describe("feature modules against the real Vim API", () => {
	it("hands every default binding to vim and takes every one back", () => {
		const editor = makeEditor("alpha\nbravo");
		const registry = new ActionRegistry();
		new ModuleHost({
			registry,
			modules: MODULES,
			context: { app: new App() as never, getVim: () => vimApi },
		}).load();
		const dispatcher = new VimDispatcher(
			{} as never,
			registry,
			() => editor.ctx,
			() => vimApi,
		);
		const ledger = new MappingLedger();
		const { bindings } = resolveBindings(registry);

		ledger.apply(vimApi, dispatcher, bindings);
		expect(ledger.size).toBe(bindings.length);

		ledger.clear(vimApi);
		expect(ledger.size).toBe(0);
	});
});
