import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { createScriptApi } from "../../../src/scripts/api";
import { scaffoldScripts } from "../../../src/scripts/scaffold";
import { TYPINGS } from "../../../src/scripts/typings";
import { App } from "../../mocks/obsidian";

/**
 * The `vim-tools.d.ts` written next to a user's scripts is all their editor
 * knows about the `vim` object. It is a hand-kept copy of the real API, so
 * these tests hold the two together.
 */

function realApi() {
	return createScriptApi({
		app: new App() as never,
		getVim: () => null,
		leader: "\\",
		knowsAction: () => false,
	}).api;
}

/** Type-checks `source` as a script with the typings loaded; returns the problems. */
function check(source: string): string[] {
	const files: Record<string, string> = {
		"/vim-tools.d.ts": TYPINGS,
		"/init.js": `// @ts-check\n${source}`,
	};
	const options: ts.CompilerOptions = {
		allowJs: true,
		checkJs: true,
		noEmit: true,
		strict: true,
		target: ts.ScriptTarget.ES2021,
		lib: ["lib.es2021.d.ts", "lib.dom.d.ts"],
		skipLibCheck: true,
	};
	const host = ts.createCompilerHost(options);
	const read = host.readFile.bind(host);
	const exists = host.fileExists.bind(host);
	host.readFile = (name) => files[name] ?? read(name);
	host.fileExists = (name) => name in files || exists(name);
	host.getSourceFile = ((original) => (name: string, languageVersion: ts.ScriptTarget) => {
		const text = files[name];
		return text === undefined
			? original(name, languageVersion)
			: ts.createSourceFile(name, text, languageVersion);
	})(host.getSourceFile.bind(host));
	const program = ts.createProgram(["/vim-tools.d.ts", "/init.js"], options, host);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((d) => d.file?.fileName === "/init.js" || d.file?.fileName === "/vim-tools.d.ts")
		.map((d) => `${d.file?.fileName}:${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

describe("vim-tools.d.ts", () => {
	it("is valid TypeScript on its own", () => {
		expect(check("")).toEqual([]);
	});

	it("declares every method and property the real API has", () => {
		const declared = [...TYPINGS.matchAll(/^\t\t(?:readonly )?(\w+)[(?:]/gm)].map((m) => m[1]);
		const real = Object.keys(realApi());

		expect(real.filter((name) => !declared.includes(name))).toEqual([]);
	});

	it("declares nothing the real API lacks", () => {
		const body = TYPINGS.slice(TYPINGS.indexOf("interface VimToolsApi"), TYPINGS.indexOf("const vim:"));
		const declared = [...body.matchAll(/^\t\t(?:readonly )?(\w+)[(?:]/gm)].map((m) => m[1] ?? "");
		const real = Object.keys(realApi());

		expect(declared.filter((name) => !real.includes(name))).toEqual([]);
	});

	it("accepts a script that uses every part of the API", () => {
		const problems = check(`
			vim.leader(" ");
			vim.set("textwidth", 80);
			vim.notice("hi", 1000);
			vim.action("a", (ctx, args) => { ctx.editor.getCursor(); return void args.repeat; }, { name: "A", group: "G", command: false, needsEditor: false, resultMode: "insert", isEdit: true });
			vim.motion("m", (ctx, args) => ({ line: args.head ? args.head.line : 0, ch: 0 }));
			vim.operator("o", (ctx, args) => { void args.range?.from.line; });
			vim.map("a", "b"); vim.nmap("a", "b"); vim.vmap("a", "b"); vim.imap("a", "b"); vim.omap("a", "b");
			vim.noremap("a", "b", ["normal", "visual"]); vim.nnoremap("a", "b"); vim.vnoremap("a", "b"); vim.inoremap("a", "b"); vim.onoremap("a", "b");
			vim.unmap("a"); vim.unmap("a", ["normal"]); vim.nunmap("a"); vim.vunmap("a"); vim.iunmap("a"); vim.ounmap("a");
			vim.bind("a", "m", ["normal"]);
			const ok = vim.obcommand("editor:toggle-bold");
			void ok; void vim.app;
		`);

		expect(problems).toEqual([]);
	});

	it("rejects a script that misuses the API, so the types are doing some work", () => {
		const problems = check(`vim.nmap("a"); vim.nope(); vim.action("a", () => {}, { resultMode: "sideways" });`);

		expect(problems.length).toBeGreaterThanOrEqual(3);
	});

	it("types the mode a context reports", () => {
		const problems = check(
			`vim.action("a", (ctx) => { const m = ctx.mode; if (m === "visual-line") {} if (m === "bogus") {} });`,
		);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/bogus/);
	});

	it("accepts the script that Create scripts folder writes", async () => {
		const app = new App();
		await scaffoldScripts(app as never, ".obsidian/vim-tools");
		const starter = app.vault.adapter.files.get(".obsidian/vim-tools/init.js") ?? "";

		expect(starter).not.toBe("");
		expect(check(starter)).toEqual([]);
	});

	it("accepts the example in the README", () => {
		const example = /```js\n([\s\S]*?)```/.exec(readFileSync("README.md", "utf8"))?.[1] ?? "";

		expect(example).not.toBe("");
		expect(check(example)).toEqual([]);
	});
});
