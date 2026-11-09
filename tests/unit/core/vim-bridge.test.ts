import { describe, expect, it } from "vitest";

// Imported directly rather than through `obsidian` so that `tsc` sees the mock's
// test helpers too, not just the real (much narrower) Obsidian typings.
import { App } from "../../mocks/obsidian";
import { VimBridge, isVimEnabled, readVimApi } from "../../../src/core/vim-bridge";
import type { VimApi } from "../../../src/types";

function installFakeVim(): VimApi {
	const vim = { map: () => {} } as unknown as VimApi;
	(window as unknown as Record<string, unknown>).CodeMirrorAdapter = { Vim: vim };
	return vim;
}

describe("readVimApi", () => {
	it("returns null when Obsidian has not installed the vim extensions", () => {
		expect(readVimApi()).toBeNull();
	});

	it("returns the Vim object from window.CodeMirrorAdapter", () => {
		const vim = installFakeVim();
		expect(readVimApi()).toBe(vim);
	});
});

describe("isVimEnabled", () => {
	it("reflects the app setting", () => {
		const app = new App();
		expect(isVimEnabled(app as never)).toBe(false);
		app.vimEnabled = true;
		expect(isVimEnabled(app as never)).toBe(true);
	});
});

describe("VimBridge", () => {
	it("stays unavailable while vim mode is off, even if the API exists", () => {
		installFakeVim();
		const app = new App();
		const bridge = new VimBridge(app as never);
		bridge.load();
		app.workspace.flushLayoutReady();

		expect(bridge.vim).toBeNull();
	});

	it("notifies listeners when vim mode is turned on and off", () => {
		const vim = installFakeVim();
		const app = new App();
		const bridge = new VimBridge(app as never);
		bridge.load();

		const seen: (VimApi | null)[] = [];
		bridge.onAvailable((api) => seen.push(api));
		bridge.onUnavailable(() => seen.push(null));

		app.vimEnabled = true;
		bridge.refresh();
		app.vimEnabled = false;
		bridge.refresh();

		expect(seen).toEqual([vim, null]);
	});

	it("does not re-fire while nothing changes", () => {
		installFakeVim();
		const app = new App();
		app.vimEnabled = true;
		const bridge = new VimBridge(app as never);
		bridge.load();

		let calls = 0;
		bridge.onAvailable(() => calls++);
		bridge.refresh();
		bridge.refresh();

		expect(calls).toBe(1);
	});
});
