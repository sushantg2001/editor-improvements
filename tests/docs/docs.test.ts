import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../src/core/registry";
import { ScriptHost } from "../../src/scripts/loader";
import { editorShortcutsContribution } from "../../src/modules/editor-shortcuts";
import { DEFAULT_SETTINGS } from "../../src/constants";
import { App } from "../mocks/obsidian";

/**
 * The documentation makes promises a test can check: which commands exist, and
 * that the example a new user copies actually runs.
 */

const read = (path: string) => readFileSync(path, "utf8");

/** Every `code` span in the first column of a markdown table row. */
function firstColumnIds(markdown: string): string[] {
	const ids: string[] = [];
	for (const line of markdown.split("\n")) {
		const cell = /^\|\s*([^|]+?)\s*\|/.exec(line)?.[1];
		if (!cell || /^-+$/.test(cell) || cell === "Id") {
			continue;
		}
		for (const match of cell.matchAll(/`([^`]+)`/g)) {
			ids.push(match[1] ?? "");
		}
	}
	return ids;
}

describe("docs/editor-shortcuts.md", () => {
	const doc = read("docs/editor-shortcuts.md");
	const contribution = editorShortcutsContribution({
		app: new App() as never,
		getVim: () => null,
		settings: () => DEFAULT_SETTINGS,
	});
	const actual = (contribution.actions ?? []).map((a) => a.id);

	it("lists every command the module defines", () => {
		const documented = new Set(firstColumnIds(doc));

		const missing = actual.filter((id) => !documented.has(id));

		expect(missing).toEqual([]);
	});

	it("lists no command the module does not define", () => {
		const unknown = firstColumnIds(doc).filter((id) => !actual.includes(id));

		expect(unknown).toEqual([]);
	});

	it("states the right number of commands", () => {
		const stated = /\((\d+) of them\)/.exec(doc)?.[1];

		expect(Number(stated)).toBe(actual.length);
	});

	it("calls motions motions, and only motions", () => {
		const cursor = doc.slice(doc.indexOf("### Cursor"), doc.indexOf("### Selections"));
		const documentedCursor = firstColumnIds(cursor);
		const motions = (contribution.actions ?? []).filter((a) => a.kind === "motion").map((a) => a.id);

		// Everything documented under Cursor is a motion except the line-number prompt.
		const notMotions = documentedCursor.filter((id) => !motions.includes(id));
		expect(notMotions).toEqual(["goToLineNumber"]);
		expect(motions.filter((id) => !documentedCursor.includes(id))).toEqual([]);
	});
});

describe("docs/architecture.md", () => {
	const doc = read("docs/architecture.md");

	it("lists only folders that exist under src/", () => {
		const tree = /```\nsrc\/\n([\s\S]*?)```/.exec(doc)?.[1] ?? "";
		const folders = [...tree.matchAll(/^\s{2}(\w+)\/\s/gm)].map((m) => m[1] ?? "");

		expect(folders.length).toBeGreaterThan(0);
		for (const folder of folders) {
			expect(existsSync(`src/${folder}`), folder).toBe(true);
		}
	});

	it("names the module contract the code uses", () => {
		expect(doc).toContain("FeatureModule");
	});

	it("names things that exist", () => {
		for (const name of ["ActionRegistry", "EditorImprovementsRuntime", "MappingLedger", "ModuleHost"]) {
			if (doc.includes(name)) {
				const found = readdirRecursive("src").some((file) => read(file).includes(`class ${name}`));
				expect(found, name).toBe(true);
			}
		}
	});
});

function readdirRecursive(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? readdirRecursive(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
	);
}

describe("the README example", () => {
	const readme = read("README.md");
	const example = /```js\n([\s\S]*?)```/.exec(readme)?.[1];

	it("is there", () => {
		expect(example).toBeTruthy();
	});

	it("loads in the script host without a single complaint", async () => {
		const FOLDER = ".obsidian/editor-improvements";
		const app = new App();
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(`${FOLDER}/init.js`, example ?? "");
		const registry = new ActionRegistry();
		const host = new ScriptHost({
			app: app as never,
			registry,
			getVim: () => null,
			isEnabled: () => true,
			getFolder: () => FOLDER,
			getLeader: () => "\\",
		});

		const result = await host.reload();

		expect(result.errors).toEqual([]);
		expect(result.loaded).toEqual(["init.js"]);
		expect(registry.bindings().length).toBeGreaterThan(0);
	});
});
