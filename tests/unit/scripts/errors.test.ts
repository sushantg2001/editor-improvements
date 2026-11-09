import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/vim-tools";

async function run(code: string) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, code);
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
	return { registry, result, error: result.errors[0] };
}

describe("where an error in a script is reported", () => {
	it("names the line of a throw", async () => {
		const { error } = await run(`\n\nthrow new Error("boom");`);

		expect(error).toMatchObject({ message: "boom", line: 3 });
	});

	it("names the line of a mistake the engine finds", async () => {
		const { error } = await run(`const a = 1;\nundefinedFunction();`);

		expect(error?.line).toBe(2);
	});

	it("names the line after an await", async () => {
		const { error } = await run(`await null;\n\nthrow new Error("later");`);

		expect(error).toMatchObject({ message: "later", line: 3 });
	});

	it("names the script's line for an error the API throws, not a line in the plugin", async () => {
		// The first frame of that stack is inside the API. It used to be
		// reported as if it were a line of the script.
		const { error } = await run(`\n\nvim.action("", () => {});`);

		expect(error?.message).toMatch(/id/);
		expect(error?.line).toBe(3);
	});

	it("gives no line for a syntax error, rather than a wrong one", async () => {
		// The engine reports no position inside the script for these; the only
		// frame is the plugin's own call that compiled it.
		const { error } = await run(`const = ;`);

		expect(error?.message).toMatch(/Unexpected/);
		expect(error?.line).toBeUndefined();
	});

	it("gives no line for an import, which a script cannot use", async () => {
		const { error } = await run(`import x from "y";`);

		expect(error?.line).toBeUndefined();
	});

	it("reports a thrown string and a thrown null", async () => {
		expect((await run(`throw "plain";`)).error?.message).toBe("plain");
		expect((await run(`throw null;`)).error?.message).toBe("null");
	});
});

describe("declaring things after the script has finished", () => {
	const tick = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

	it("is refused, instead of half-applying an action the registry was never told about", async () => {
		let failure: unknown;
		// The timer's error would otherwise go to the console; catch it here.
		const t = await run(`
			setTimeout(() => {
				try { vim.action("late", () => {}); } catch (e) { globalThis.__lateError = e; }
			}, 10);
		`);
		await tick(40);
		failure = (globalThis as unknown as { __lateError?: Error }).__lateError;

		expect(t.registry.has("late")).toBe(false);
		expect(String(failure)).toMatch(/after init\.js finished/);
		delete (globalThis as unknown as { __lateError?: Error }).__lateError;
	});

	it("covers mappings and the leader too", async () => {
		const t = await run(`
			globalThis.__sealed = () => {
				const out = [];
				for (const call of [() => vim.nmap("gz", "x"), () => vim.leader(","), () => vim.nunmap("S")]) {
					try { call(); out.push("ok"); } catch (e) { out.push("refused"); }
				}
				return out;
			};
		`);
		const probe = (globalThis as unknown as { __sealed: () => string[] }).__sealed;

		expect(t.result.errors).toEqual([]);
		expect(probe()).toEqual(["refused", "refused", "refused"]);
		delete (globalThis as unknown as { __sealed?: unknown }).__sealed;
	});

	it("leaves the parts that act, rather than declare, working inside an action", async () => {
		const executed: string[] = [];
		const app = new App();
		(app as unknown as { commands: unknown }).commands = {
			executeCommandById: (id: string) => (executed.push(id), true),
		};
		app.vault.adapter.dirs.add(FOLDER);
		app.vault.adapter.files.set(
			`${FOLDER}/init.js`,
			`vim.action("go", () => vim.obcommand("daily-notes"), { needsEditor: false });`,
		);
		const registry = new ActionRegistry();
		await new ScriptHost({
			app: app as never,
			registry,
			getVim: () => null,
			isEnabled: () => true,
			getFolder: () => FOLDER,
			getLeader: () => "\\",
		}).reload();

		// Run long after the script has finished.
		await registry.get("go")?.run({ app } as never, { repeat: 1 });

		expect(executed).toEqual(["daily-notes"]);
	});

	it("does not stop a script from declaring after an await", async () => {
		const { registry, result } = await run(`await Promise.resolve(); vim.action("afterAwait", () => {});`);

		expect(result.errors).toEqual([]);
		expect(registry.has("afterAwait")).toBe(true);
	});
});
