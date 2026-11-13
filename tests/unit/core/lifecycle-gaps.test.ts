import { describe, expect, it, vi } from "vitest";

import { CmListeners } from "../../../src/core/cm-listeners";
import { ModeTracker } from "../../../src/core/modes";
import { ActionRegistry } from "../../../src/core/registry";
import { isVimEnabled } from "../../../src/core/vim-bridge";
import { App } from "../../mocks/obsidian";
import type { VimMode } from "../../../src/types";
import type { CodeMirrorShim } from "../../../src/types";

describe("isVimEnabled", () => {
	it("is false when Obsidian offers no way to ask, rather than guessing yes", () => {
		expect(isVimEnabled({} as never)).toBe(false);
	});

	it("follows what Obsidian says", () => {
		const app = new App();
		expect(isVimEnabled(app as never)).toBe(false);
		app.vimEnabled = true;
		expect(isVimEnabled(app as never)).toBe(true);
	});
});

describe("ModeTracker.onChange", () => {
	const setMode = (tracker: ModeTracker, mode: VimMode) =>
		(tracker as unknown as { setMode(mode: VimMode): void }).setMode(mode);

	it("stops telling a listener once it unsubscribes, and only that one", () => {
		const tracker = new ModeTracker(new App() as never);
		const first = vi.fn();
		const second = vi.fn();
		const unsubscribe = tracker.onChange(first);
		tracker.onChange(second);
		first.mockClear();
		second.mockClear();

		unsubscribe();
		setMode(tracker, "insert");

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith("insert");
	});

	it("does not drop another listener when the same one unsubscribes twice", () => {
		const tracker = new ModeTracker(new App() as never);
		const first = vi.fn();
		const second = vi.fn();
		const unsubscribe = tracker.onChange(first);
		tracker.onChange(second);
		second.mockClear();

		unsubscribe();
		unsubscribe();
		setMode(tracker, "visual");

		expect(second).toHaveBeenCalledWith("visual");
	});
});

describe("ActionRegistry.batch", () => {
	const action = (id: string) => ({ id, name: id, group: "Test", kind: "action" as const, run: () => undefined });

	it("tells listeners once for the changes made inside it", () => {
		const registry = new ActionRegistry();
		const seen = vi.fn();
		registry.onChange(seen);

		registry.batch(() => {
			registry.set("a", { actions: [action("one")] });
			registry.set("b", { actions: [action("two")] });
		});

		expect(seen).toHaveBeenCalledOnce();
	});

	it("tells nobody when nothing changed inside it, however many batches ran before", () => {
		const registry = new ActionRegistry();
		const seen = vi.fn();
		registry.onChange(seen);
		registry.batch(() => registry.set("a", { actions: [action("one")] }));
		seen.mockClear();

		registry.batch(() => undefined);
		registry.batch(() => undefined);

		expect(seen).not.toHaveBeenCalled();
	});
});

describe("CmListeners", () => {
	it("forgets an editor that has no input field any more", () => {
		const listeners = new CmListeners("evt", () => () => {});
		const gone = { getInputField: () => undefined, on: () => {}, off: () => {} } as unknown as CodeMirrorShim;
		const field = document.body.appendChild(document.createElement("div"));
		const live = { getInputField: () => field, on: () => {}, off: () => {} } as unknown as CodeMirrorShim;
		listeners.attach(gone);
		expect(listeners.size).toBe(1);

		listeners.attach(live);

		expect(listeners.size).toBe(1);
	});
});
