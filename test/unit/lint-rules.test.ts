import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { mayImport } from "../../tools/lint/boundaries";
import project from "../../tools/lint/index";

// The root as cwd, so the config also matches the temporary projects below.
const linter = new Linter({ configType: "flat", cwd: "/" });

function lint(rule: string, path: string, code: string, root = "/repo"): string[] {
	const config: Linter.Config = {
		files: ["**/*.ts"],
		languageOptions: { parser: tseslint.parser },
		plugins: { project },
		rules: { [`project/${rule}`]: "error" },
	};
	return linter.verify(code, config, { filename: `${root}/src/${path}` }).map((message) => message.message);
}

describe("module boundaries", () => {
	test("notation imports nothing from src", () => {
		expect(mayImport("notation/parse", "events", false)).toBe(false);
		expect(mayImport("notation/parse", "notation/event", false)).toBe(true);
	});

	test("the router reaches actions only through the registry", () => {
		expect(mayImport("router/dispatch", "actions/registry", false)).toBe(true);
		expect(mayImport("router/dispatch", "actions/plugin-actions", false)).toBe(false);
	});

	test("actions see the engine interface but no engine", () => {
		expect(mayImport("actions/registry", "engine/engine", false)).toBe(true);
		expect(mayImport("actions/registry", "engine/fork", false)).toBe(false);
	});

	test("lua may import the router's types and nothing else of it", () => {
		expect(mayImport("lua/compile", "router/router", true)).toBe(true);
		expect(mayImport("lua/compile", "router/router", false)).toBe(false);
		expect(mayImport("lua/compile", "router/trie", true)).toBe(false);
	});

	test("main reaches only the container and the lifecycle", () => {
		expect(mayImport("main", "container", false)).toBe(true);
		expect(mayImport("main", "lifecycle/lifecycle", false)).toBe(true);
		expect(mayImport("main", "router/router", false)).toBe(false);
	});

	test("the rule reports a forbidden import and accepts an allowed one", () => {
		expect(lint("module-boundaries", "router/dispatch.ts", `import { x } from "../actions/plugin-actions";`)).toEqual(["router/dispatch may not import actions/plugin-actions."]);
		expect(lint("module-boundaries", "router/dispatch.ts", `import { x } from "../actions/registry";`)).toEqual([]);
	});
});

describe("special places", () => {
	test("ENGINE-R3: only the fork module imports the engine package", () => {
		const code = `import { Vim } from "@saberzero1/codemirror-vim";`;
		expect(lint("fork-imports", "engine/fork.ts", code)).toEqual([]);
		expect(lint("fork-imports", "engine/builtin.ts", code)).toHaveLength(1);
		expect(lint("fork-imports", "router/router.ts", `const v = import("@saberzero1/codemirror-vim");`)).toHaveLength(1);
	});

	test("MOBILE-R1: Node and Electron load only dynamically, in desktop-only modules", () => {
		expect(lint("node-imports", "router/router.ts", `import fs from "node:fs";`)).toHaveLength(1);
		expect(lint("node-imports", "actions/native/desktop.ts", `import { remote } from "electron";`)).toHaveLength(1);
		expect(lint("node-imports", "router/router.ts", `const e = import("electron");`)).toHaveLength(1);
		expect(lint("node-imports", "router/router.ts", `const c = require("child_process");`)).toHaveLength(1);
		expect(lint("node-imports", "actions/native/desktop.ts", `const e = import("@electron/remote");`)).toEqual([]);
		expect(lint("node-imports", "engine/neovim/rpc.ts", `const c = import("node:child_process");`)).toEqual([]);
		expect(lint("node-imports", "router/router.ts", `import type { Buffer } from "node:buffer";`)).toEqual([]);
	});

	test("only the internals module touches Obsidian's key internals", () => {
		const code = `app.keymap.getWindowStack(window).prevScopes; app.scope.keys.length;`;
		expect(lint("obsidian-internals", "router/obsidian-internals.ts", code)).toEqual([]);
		expect(lint("obsidian-internals", "router/install.ts", code)).toHaveLength(3);
		expect(lint("obsidian-internals", "router/install.ts", `Object.keys(x); map.keys();`)).toEqual([]);
	});
});

describe("import cycles", () => {
	const roots: string[] = [];
	const project_ = (files: Record<string, string>): string => {
		const root = mkdtempSync(join(tmpdir(), "lint-cycles-"));
		roots.push(root);
		for (const [path, text] of Object.entries(files)) {
			const file = join(root, "src", path);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, text);
		}
		return root;
	};
	afterAll(() => {
		for (const root of roots) rmSync(root, { recursive: true, force: true });
	});

	test("a runtime cycle fails", () => {
		const files = { "a.ts": `import { b } from "./b"; export const a = b;`, "b.ts": `import { a } from "./a"; export const b = a;` };
		const root = project_(files);
		expect(lint("no-cycles", "a.ts", files["a.ts"], root)).toEqual(["Import cycle: a -> b -> a."]);
	});

	test("a cycle through type-only imports is fine", () => {
		const files = { "a.ts": `import type { B } from "./b"; export type A = B;`, "b.ts": `import { type A } from "./a"; export type B = A;` };
		const root = project_(files);
		expect(lint("no-cycles", "a.ts", files["a.ts"], root)).toEqual([]);
	});
});
