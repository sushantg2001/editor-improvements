import { beforeEach, describe, expect, it, vi } from "vitest";

import { VimDispatcher } from "../../../src/core/dispatch";
import { ActionRegistry } from "../../../src/core/registry";
import { App, Notice } from "../../mocks/obsidian";
import type { CodeMirrorShim, VimActionDef, VimApi, VimContext } from "../../../src/types";

function fakeCm(mode = "normal"): CodeMirrorShim {
	return {
		state: { vim: { mode, visualMode: mode.startsWith("visual"), insertMode: mode === "insert" } },
		getInputField: () => document.createElement("div"),
		on: () => {},
		off: () => {},
		listSelections: () => [],
		setCursor: () => {},
		operation: <T>(fn: () => T) => fn(),
	};
}

function setup(options: { withEditor?: boolean; mode?: string } = {}) {
	const { withEditor = true, mode = "normal" } = options;
	const registry = new ActionRegistry();
	const app = new App();
	const cm = fakeCm(mode);
	const vim = {
		handleKey: vi.fn(),
		exitVisualMode: vi.fn(),
	} as unknown as VimApi & {
		handleKey: ReturnType<typeof vi.fn>;
		exitVisualMode: ReturnType<typeof vi.fn>;
	};
	const ctx = {
		app,
		editor: {} as never,
		view: {} as never,
		cm,
		mode,
	} as unknown as VimContext;

	const dispatcher = new VimDispatcher(
		app as never,
		registry,
		() => (withEditor ? ctx : null),
		() => vim,
	);

	/** Contributes one action, the way a source would. */
	const give = (def: VimActionDef, source = "test") => {
		registry.set(source, { actions: [def] });
	};

	return { registry, dispatcher, cm, app, vim, give };
}

function action(id: string, extra: Partial<VimActionDef> = {}): VimActionDef {
	return { id, name: id, group: "Test", kind: "action", run: () => {}, ...extra };
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("VimDispatcher.invoke", () => {
	it("runs an editor action when an editor is available", () => {
		const { dispatcher, cm, give } = setup();
		const run = vi.fn();
		give(action("a", { run }));

		dispatcher.invoke("a", cm);

		expect(run).toHaveBeenCalledOnce();
	});

	it("refuses an editor action when there is no editor, and says so", () => {
		const { dispatcher, give } = setup({ withEditor: false });
		const run = vi.fn();
		give(action("a", { run }));

		dispatcher.invoke("a", null);

		expect(run).not.toHaveBeenCalled();
		expect(Notice.messages[0]).toContain("no active editor");
	});

	it("still runs a needsEditor:false action when there is no editor", () => {
		// Regression: `Copy path` is useful precisely when focus is not in a
		// note. An earlier cut built a null context and then silently dropped
		// the call, so the action never ran.
		const { dispatcher, give } = setup({ withEditor: false });
		const run = vi.fn();
		give(action("copyPath", { needsEditor: false, run }));

		dispatcher.invoke("copyPath", null);

		expect(run).toHaveBeenCalledOnce();
		expect(Notice.messages).toHaveLength(0);
	});

	it("gives a needsEditor:false action a usable app on the context", () => {
		const { dispatcher, app, give } = setup({ withEditor: false });
		let seen: unknown;
		give(action("a", { needsEditor: false, run: (ctx) => void (seen = ctx.app) }));

		dispatcher.invoke("a", null);

		expect(seen).toBe(app);
	});

	it("ignores an unknown id without throwing", () => {
		const { dispatcher, cm } = setup();
		expect(() => dispatcher.invoke("nope", cm)).not.toThrow();
	});

	it("reports a thrown error against the source that contributed it", () => {
		const { dispatcher, cm, give } = setup();
		give(
			action("a", {
				run: () => {
					throw new Error("boom");
				},
			}),
			"script:init.js",
		);

		dispatcher.invoke("a", cm);

		expect(Notice.messages[0]).toContain("script:init.js");
		expect(Notice.messages[0]).toContain("boom");
	});

	it("reports a rejected promise instead of leaving it unhandled", async () => {
		const { dispatcher, cm, give } = setup();
		give(action("a", { run: () => Promise.reject(new Error("nope")) }));

		dispatcher.invoke("a", cm);
		await Promise.resolve();
		await Promise.resolve();

		expect(Notice.messages[0]).toContain("nope");
	});
});

describe("VimDispatcher result modes", () => {
	it("enters insert mode after a synchronous action", () => {
		const { dispatcher, cm, vim, give } = setup();
		give(action("a", { resultMode: "insert" }));

		dispatcher.invoke("a", cm);

		expect(vim.handleKey).toHaveBeenCalledExactlyOnceWith(cm, "i", "user");
	});

	it("enters insert mode after an async action resolves", async () => {
		// Regression: an earlier cut returned early for promises and never
		// applied resultMode, so `Paste as plain text` stayed in normal mode.
		const { dispatcher, cm, vim, give } = setup();
		give(action("a", { resultMode: "insert", run: () => Promise.resolve() }));

		dispatcher.invoke("a", cm);
		expect(vim.handleKey).not.toHaveBeenCalled();

		await Promise.resolve();
		await Promise.resolve();

		expect(vim.handleKey).toHaveBeenCalledExactlyOnceWith(cm, "i", "user");
	});

	it("does not re-enter insert mode when already there", () => {
		const { dispatcher, cm, vim, give } = setup({ mode: "insert" });
		give(action("a", { resultMode: "insert" }));

		dispatcher.invoke("a", cm);

		expect(vim.handleKey).not.toHaveBeenCalled();
	});

	it("skips result mode for an action with no editor", () => {
		const { dispatcher, vim, give } = setup({ withEditor: false });
		give(action("a", { needsEditor: false, resultMode: "insert" }));

		dispatcher.invoke("a", null);

		expect(vim.handleKey).not.toHaveBeenCalled();
	});
});
