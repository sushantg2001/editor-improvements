import { describe, expect, it } from "vitest";

import { expandLeader } from "../../../src/scripts/api";
import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

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
	return { registry, error: result.errors[0] };
}

describe("expanding <leader>", () => {
	it("uses a leader containing $ as the key it is", () => {
		expect(expandLeader("<leader>a", "$")).toBe("$a");
		expect(expandLeader("<leader>a", "$$")).toBe("$$a");
		expect(expandLeader("<leader>a<leader>b", "$&")).toBe("$&a$&b");
	});
});

describe("vim.leader", () => {
	it("refuses an empty leader, which would map over a built-in key", async () => {
		const { registry, error } = await run(`vim.leader(""); vim.nmap("<leader>x", "dd");`);

		expect(error?.message).toMatch(/leader/);
		expect(registry.bindings()).toEqual([]);
	});

	it("refuses a leader that is not a string", async () => {
		const { error } = await run(`vim.leader(undefined);`);

		expect(error?.message).toMatch(/leader/);
	});

	it("keeps the leader from before when a bad one is refused", async () => {
		const { registry, error } = await run(
			`try { vim.leader(""); } catch {} vim.leader(","); vim.nnoremap("<leader>d", "dd");`,
		);

		expect(error).toBeUndefined();
		expect(registry.bindings().map((binding) => binding.keys)).toEqual([",d"]);
	});
});
