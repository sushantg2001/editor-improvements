import { describe, expect, test } from "bun:test";
import type { App } from "obsidian";
import { findConflict } from "../../src/lifecycle/conflicts";

const app = (enabled: string[], installed: string[]): App =>
	({ plugins: { enabledPlugins: new Set(enabled), manifests: Object.fromEntries(installed.map((id) => [id, { id }])) } }) as unknown as App;

describe("conflict check", () => {
	test("an installed, enabled key plugin is a conflict", () => {
		expect(findConflict(app(["obsidian-vimrc-support"], ["obsidian-vimrc-support"]))).toBe("Vimrc Support");
	});

	test("an enabled id whose plugin was deleted is not a conflict", () => {
		expect(findConflict(app(["obsidian-vimrc-support", "obsidian-editor-shortcuts"], []))).toBeNull();
	});

	test("an installed plugin that is turned off is not a conflict", () => {
		expect(findConflict(app([], ["vim-tools"]))).toBeNull();
	});
});
