import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, MODE_CLASS_PREFIX, VIM_MODES } from "../../../src/constants";
import { ModeStatusBar } from "../../../src/ui/status-bar";
import type { VimToolsSettings } from "../../../src/types";

function bar(settings: Partial<VimToolsSettings> = {}) {
	const el = document.createElement("div");
	const status = new ModeStatusBar(el, () => ({ ...DEFAULT_SETTINGS, ...settings }));
	return { el, status };
}

describe("ModeStatusBar", () => {
	it.each(VIM_MODES)("shows the label and class for %s", (mode) => {
		const { el, status } = bar();

		status.render(mode);

		expect(el.textContent).toBe(DEFAULT_SETTINGS.modePrompts[mode]);
		expect(el.classList.contains(`${MODE_CLASS_PREFIX}${mode}`)).toBe(true);
		expect(el.getAttribute("aria-label")).toBe(`Vim mode: ${mode}`);
	});

	it("carries only the class of the current mode", () => {
		const { el, status } = bar();

		status.render("insert");
		status.render("visual-line");

		const modes = [...el.classList].filter((c) => c.startsWith(MODE_CLASS_PREFIX));
		expect(modes).toEqual([`${MODE_CLASS_PREFIX}visual-line`]);
	});

	it("uses the user's own label", () => {
		const { el, status } = bar({
			modePrompts: { ...DEFAULT_SETTINGS.modePrompts, "visual-block": "BLK" },
		});

		status.render("visual-block");

		expect(el.textContent).toBe("BLK");
	});

	it("hides itself when turned off, and comes back", () => {
		const settings = { ...DEFAULT_SETTINGS, showModeInStatusBar: false };
		const el = document.createElement("div");
		const status = new ModeStatusBar(el, () => settings);

		status.render("normal");
		expect(el.textContent).toBe("");
		expect(el.classList.contains("is-hidden")).toBe(true);

		settings.showModeInStatusBar = true;
		status.render("normal");
		expect(el.classList.contains("is-hidden")).toBe(false);
		expect(el.textContent).toBe("NORMAL");
	});
});

describe("styles.css", () => {
	const css = readFileSync("styles.css", "utf8");

	it.each(VIM_MODES)("styles the class the status bar sets for %s", (mode) => {
		const selector = `.vim-tools-mode.${MODE_CLASS_PREFIX}${mode}`;

		expect(css, selector).toContain(selector);
	});
});
