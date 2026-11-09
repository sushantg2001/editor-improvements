import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contextMenuModule } from "../../../src/modules/context-menu";
import { moduleHarness } from "../../helpers/modules";
import { Notice } from "../../mocks/obsidian";
import { modeOf, press, vimApi } from "../../helpers/vim";

/** Copy path and Paste as plain text, against the real addon and a stand-in clipboard. */

afterEach(() => {
	vimApi.mapclear();
	vi.restoreAllMocks();
});

let clipboard: { readText: ReturnType<typeof vi.fn>; writeText: ReturnType<typeof vi.fn> };

beforeEach(() => {
	Notice.messages.length = 0;
	clipboard = { readText: vi.fn(), writeText: vi.fn() };
	Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
});

const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe("Copy path", () => {
	it("copies the active file's path and says so", async () => {
		clipboard.writeText.mockResolvedValue(undefined);
		const t = moduleHarness(contextMenuModule, "text");
		t.app.workspace.activeFile = { path: "projects/plan.md" };

		t.invoke("copyPath");
		await settle();

		expect(clipboard.writeText).toHaveBeenCalledWith("projects/plan.md");
		expect(Notice.messages.at(-1)).toBe("Copied path: projects/plan.md");
	});

	it("says there is nothing to copy when no file is open, and copies nothing", async () => {
		const t = moduleHarness(contextMenuModule, "text");
		t.app.workspace.activeFile = null;

		t.invoke("copyPath");
		await settle();

		expect(clipboard.writeText).not.toHaveBeenCalled();
		expect(Notice.messages.at(-1)).toMatch(/no active file/i);
	});

	it("reports a clipboard that refuses, instead of pretending it worked", async () => {
		clipboard.writeText.mockRejectedValue(new Error("denied"));
		const t = moduleHarness(contextMenuModule, "text");
		t.app.workspace.activeFile = { path: "a.md" };

		t.invoke("copyPath");
		await settle();

		expect(Notice.messages.some((m) => m.includes("denied"))).toBe(true);
		expect(Notice.messages.some((m) => m.startsWith("Copied path"))).toBe(false);
	});

	it("works with no editor open", async () => {
		clipboard.writeText.mockResolvedValue(undefined);
		const t = moduleHarness(contextMenuModule, "text");
		t.app.workspace.activeFile = { path: "a.md" };

		// Not through the editor's command path: the dispatcher given no cm.
		t.dispatcher.invoke("copyPath", null);
		await settle();

		expect(clipboard.writeText).toHaveBeenCalledWith("a.md");
	});
});

describe("Paste as plain text", () => {
	it("pastes at the cursor and leaves vim in insert mode", async () => {
		clipboard.readText.mockResolvedValue("XY");
		const t = moduleHarness(contextMenuModule, "abc");
		t.bind("gP", "pasteAsPlainText");
		press(t.cm, "l");

		press(t.cm, "g", "P");
		await settle();

		expect(t.text()).toBe("aXYbc");
		expect(modeOf(t.cm)).toBe("insert");
	});

	it("replaces a visual selection", async () => {
		clipboard.readText.mockResolvedValue("--");
		const t = moduleHarness(contextMenuModule, "one two three");
		t.bind("gP", "pasteAsPlainText");
		press(t.cm, "w", "v", "e");

		press(t.cm, "g", "P");
		await settle();

		expect(t.text()).toBe("one -- three");
		expect(modeOf(t.cm)).toBe("insert");
	});

	it("pastes multiple lines as they are", async () => {
		clipboard.readText.mockResolvedValue("a\nb");
		const t = moduleHarness(contextMenuModule, "");
		t.bind("gP", "pasteAsPlainText");

		press(t.cm, "g", "P");
		await settle();

		expect(t.text()).toBe("a\nb");
	});

	it("changes nothing when the clipboard is empty", async () => {
		clipboard.readText.mockResolvedValue("");
		const t = moduleHarness(contextMenuModule, "abc");
		t.bind("gP", "pasteAsPlainText");

		press(t.cm, "g", "P");
		await settle();

		expect(t.text()).toBe("abc");
	});

	it("reports a clipboard that cannot be read", async () => {
		clipboard.readText.mockRejectedValue(new Error("blocked"));
		const t = moduleHarness(contextMenuModule, "abc");
		t.bind("gP", "pasteAsPlainText");

		press(t.cm, "g", "P");
		await settle();

		expect(t.text()).toBe("abc");
		expect(Notice.messages.some((m) => m.includes("blocked"))).toBe(true);
	});
});
