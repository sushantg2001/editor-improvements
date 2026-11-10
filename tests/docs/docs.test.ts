import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../src/core/registry";
import { ScriptHost } from "../../src/scripts/loader";
import { editorShortcutsContribution } from "../../src/modules/editor-shortcuts";
import { DEFAULT_SETTINGS, PLUGIN_ID } from "../../src/constants";
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
		for (const name of ["ActionRegistry", "VimToolsRuntime", "MappingLedger", "ModuleHost"]) {
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
		const FOLDER = ".obsidian/vim-tools";
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

describe("the commit and branch types", () => {
	const TYPES = ["feat", "fix", "perf", "refactor", "test", "docs", "build", "ci", "chore", "style", "revert"];
	const workflow = read(".github/workflows/pr-title.yml");

	it("are the same in the PR title check and the branch check", () => {
		const patterns = [...workflow.matchAll(/\^\(?\(?((?:[a-z]+\|)+[a-z]+)\)/g)].map((m) => (m[1] ?? "").split("|"));

		expect(patterns.length).toBe(2);
		for (const types of patterns) {
			expect(types).toEqual(TYPES);
		}
	});

	it.each(["CONTRIBUTING.md", "docs/sdlc.md"])("are all named in %s", (file) => {
		const text = read(file);

		for (const type of TYPES) {
			expect(text, `${type} in ${file}`).toMatch(new RegExp(`\\b${type}\\b`));
		}
	});

	it("accept the branch names this repository uses", () => {
		const pattern = /^((feat|fix|perf|refactor|test|docs|build|ci|chore|style|revert)\/[a-z0-9][a-z0-9._-]*|release-please--.+)$/;

		for (const branch of ["feat/editor-shortcuts", "fix/key-names", "docs/release-types", "release-please--branches--main--components--vim-tools"]) {
			expect(pattern.test(branch), branch).toBe(true);
		}
		for (const branch of ["claude/anything", "feature/x", "Fix/Upper", "fix/"]) {
			expect(pattern.test(branch), branch).toBe(false);
		}
	});
});

describe("links between the documents", () => {
	const FILES = ["README.md", "CONTRIBUTING.md", "SECURITY.md", ...readdirSync("docs").map((f) => `docs/${f}`)].filter(
		(f) => f.endsWith(".md") && existsSync(f),
	);

	/** Every `[text](target)` and `[text][ref]` target that is a path in this repository. */
	function localTargets(file: string): string[] {
		const text = read(file);
		const refs = new Map([...text.matchAll(/^\[([^\]]+)\]:\s*(\S+)/gm)].map((m) => [m[1] ?? "", m[2] ?? ""]));
		const inline = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? "");
		const referenced = [...text.matchAll(/\]\[([^\]]+)\]/g)].map((m) => refs.get(m[1] ?? "") ?? "");
		return [...inline, ...referenced].filter((t) => t && !/^[a-z]+:|^#/i.test(t));
	}

	it.each(FILES)("every relative link in %s points at a file that exists", (file) => {
		const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
		const missing = localTargets(file)
			.map((target) => target.split("#")[0] ?? "")
			.filter((target) => target && !existsSync(`${dir}/${target}`));

		expect(missing).toEqual([]);
	});

	it("covers the documents that exist", () => {
		expect(FILES).toEqual(expect.arrayContaining(["README.md", "CONTRIBUTING.md", "docs/architecture.md"]));
	});
});

describe("the plugin's identity files agree", () => {
	const manifest = JSON.parse(read("manifest.json")) as { id: string; version: string; minAppVersion: string; name: string };
	const pkg = JSON.parse(read("package.json")) as { version: string };
	const releaseManifest = JSON.parse(read(".release-please-manifest.json")) as Record<string, string>;
	const versions = JSON.parse(read("versions.json")) as Record<string, string>;

	it("use one id, the one the code registers commands under", () => {
		expect(manifest.id).toBe(PLUGIN_ID);
	});

	it("carry one version, so the release check on the tag cannot fail on a mismatch", () => {
		expect(pkg.version).toBe(manifest.version);
		expect(releaseManifest["."]).toBe(manifest.version);
	});

	it("name no minimum app version later than the newest one in versions.json", () => {
		const newest = Object.values(versions).sort((a, b) =>
			a.localeCompare(b, undefined, { numeric: true }),
		);
		expect(newest.at(-1)).toBeDefined();
		expect(manifest.minAppVersion.localeCompare(newest.at(-1) ?? "", undefined, { numeric: true })).toBeLessThanOrEqual(0);
	});
});
