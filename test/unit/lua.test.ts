import { describe, expect, test } from "bun:test";
import type { ActionResult, RunContext } from "../../src/actions/registry";
import type { Engine } from "../../src/engine/engine";
import { type ConfigHost, type ConfigResult, runConfig } from "../../src/lua/config";
import { STARTER_CONFIG } from "../../src/lua/starter";

const COMMANDS = new Set(["editor:save-file", "switcher:open", "command-palette:open", "workspace:split-vertical"]);

function host(log: string[] = []): ConfigHost {
	return {
		app: {
			commands: {
				findCommand: (id: string) => (COMMANDS.has(id) ? { id } : undefined),
				executeCommandById: (id: string) => {
					log.push(`command ${id}`);
					return true;
				},
				listCommands: () => [...COMMANDS].map((id) => ({ id, name: id })),
			},
			workspace: { getActiveFile: () => ({ path: "Notes/a.md" }), activeEditor: null },
		} as unknown as ConfigHost["app"],
		engine: {
			isOption: (name: string) => name === "ignorecase",
			getOption: () => false,
			runEx: (_: unknown, line: string) => (log.push(`ex ${line}`), null),
		} as unknown as Engine,
		actions: {
			get: (id: string) => (id.startsWith("nope") ? undefined : ({ id } as never)),
			validate: (ids: Iterable<string>) => [...ids].filter((id) => id.includes("nope")).map((id) => ({ id, problem: "no" })),
			run: (id: string): ActionResult => {
				log.push(`action ${id}`);
				return "handled";
			},
		},
		platform: { desktop: true, mobile: false, os: "linux", version: "1.15.1" },
		notify: (message, level) => log.push(`notify ${level} ${message}`),
	};
}

const load = (source: string, extra: Record<string, string> = {}, target = host()): ConfigResult => runConfig(new Map([["init.lua", source], ...Object.entries(extra)]), target);

function ok(result: ConfigResult) {
	if (!result.ok) throw new Error(result.error);
	return result.config;
}

const context: RunContext = { classified: null, event: null };

describe("Lua config", () => {
	test("LUA-A3: the starter config loads", () => {
		const config = ok(load(STARTER_CONFIG));
		expect(config.timeoutlen).toBe(500);
		expect(config.mappings.some((m) => m.context === "global" && m.keys.join("") === "<C-p>")).toBe(true);
		expect(config.mappings.some((m) => m.context === "editor:n" && m.keys.join("") === "<Space>f")).toBe(true);
		expect(config.engine.maps.some((m) => m.mode === "i" && m.lhs.join("") === "jk" && m.rhs.join("") === "<Esc>")).toBe(true);
	});

	test("vim.keymap.set maps keys in the engine, and functions in the router", () => {
		const config = ok(load(`vim.g.mapleader = ","
			vim.keymap.set({ "n", "x" }, "<leader>a", "dd", { remap = true, desc = "x", silent = true })
			vim.keymap.set("", "Q", "gq")
			vim.keymap.set("n", "<leader>b", function() end, { desc = "Run" })`));
		expect(config.engine.maps.filter((m) => m.lhs.join("") === ",a").map((m) => [m.mode, m.noremap])).toEqual([["n", false], ["x", false]]);
		expect(config.engine.maps.filter((m) => m.lhs.join("") === "Q").map((m) => m.mode)).toEqual(["n", "v", "o"]);
		const fn = config.mappings.find((m) => m.keys.join("") === ",b");
		expect(fn?.context).toBe("editor:n");
		expect(fn?.desc).toBe("Run");
		expect(fn?.action.startsWith("lua:")).toBe(true);
	});

	test("NOTATION-R8: changing the leader leaves earlier mappings alone", () => {
		const config = ok(load(`vim.g.mapleader = ","
			vim.keymap.set("n", "<leader>x", "dd")
			vim.g.mapleader = ";"
			vim.keymap.set("n", "<leader>y", "dd")`));
		expect(config.engine.maps.map((m) => m.lhs.join(""))).toEqual([",x", ";y"]);
	});

	test("a later mapping replaces an earlier one, and del removes it", () => {
		const config = ok(load(`vim.keymap.set("n", "a", "b")
			vim.keymap.set("n", "a", function() end)
			vim.keymap.set("n", "c", "d")
			vim.keymap.del("n", "c")`));
		expect(config.engine.maps).toEqual([]);
		expect(config.mappings).toHaveLength(1);
	});

	test("LUA-A4: unsupported arguments raise an error naming them", () => {
		for (const [source, message] of [
			[`vim.keymap.set("n", "a", "b", { expr = true })`, "Unsupported option: expr"],
			[`vim.keymap.set("s", "a", "b")`, 'Unsupported mode: "s"'],
			[`vim.keymap.del("n", "zz")`, "No mapping for zz"],
			[`vim.o.nope = 1`, "Unknown option: nope"],
			[`vim.o.strictkeys = 1`, "strictkeys must be a boolean"],
			[`obsidian.keymap.set("nowhere", "a", "native:copy")`, 'Unknown context: "nowhere"'],
			[`obsidian.keymap.set("global", "a", "copy")`, 'Unknown action: "copy"'],
			[`obsidian.command("nope:x")`, "Unknown command"],
			[`obsidian.run("nope:x")`, "Unknown action"],
		] as const) {
			const result = load(source);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain(message);
		}
	});

	test("LUA-A4b: a string rhs is always keys", () => {
		const config = ok(load(`vim.keymap.set("n", "x", "obsidian:switcher:open")`));
		expect(config.mappings).toEqual([]);
		expect(config.engine.maps[0]?.rhs[0]).toBe("o");
	});

	test("options reach the router and the engine", () => {
		const config = ok(load(`vim.o.timeoutlen = 250
			vim.o.strictkeys = false
			vim.opt.ignorecase = true
			assert(vim.opt.timeoutlen:get() == 250)
			assert(vim.o.ignorecase == true)`));
		expect([config.timeoutlen, config.strictkeys]).toEqual([250, false]);
		expect(config.engine.options).toEqual([["ignorecase", true]]);
	});

	test("LUA-A2: an error names the file and line", () => {
		const result = load(`require("keys")`, { "lua/keys.lua": `local a = 1\n\nerror("broken")` });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("lua/keys.lua:3");
		const direct = load(`\n\nvim.keymap.set("q", "a", "b")`);
		if (!direct.ok) expect(direct.error).toContain("init.lua:3");
		const syntax = load(`if`);
		if (!syntax.ok) expect(syntax.error).toContain("init.lua:1");
	});

	test("CONFIG-A1: require finds modules and folders, once, also from a mapping", () => {
		const log: string[] = [];
		const config = ok(load(`local a = require("one.two")
			local b = require("pack")
			assert(a.value == 2 and b.value == 3 and require("one.two") == a)
			vim.keymap.set("n", "x", function() vim.notify(require("pack").value .. "") end)`, {
			"lua/one/two.lua": `return { value = 2 }`,
			"lua/pack/init.lua": `return { value = 3 }`,
		}, host(log)));
		expect(config.luaActions[0]?.run(context)).toBe("handled");
		expect(log).toContain("notify 2 3");
	});

	test("CONFIG-A2 and ACTIONS-A7: infinite loops are stopped", () => {
		const atLoad = load(`while true do end`);
		expect(atLoad.ok).toBe(false);
		if (!atLoad.ok) expect(atLoad.error).toContain("instruction limit");
		const guarded = load(`while true do pcall(function() while true do end end) end`);
		expect(guarded.ok).toBe(false);
		const config = ok(load(`vim.keymap.set("n", "x", function() while true do end end)`));
		expect(() => config.luaActions[0]?.run(context)).toThrow("instruction limit");
	});

	test("a function gets its context and can decline", () => {
		const log: string[] = [];
		const config = ok(load(`vim.keymap.set("n", "x", function(ctx) vim.notify(ctx.path .. " " .. ctx.mode); return false end)`, {}, host(log)));
		const classified = { context: "editor", mode: "n", win: window } as unknown as RunContext["classified"];
		expect(config.luaActions[0]?.run({ classified, event: null })).toBe("not-applicable");
		expect(log).toContain("notify 2 Notes/a.md n");
	});

	test("obsidian.* runs commands and actions", () => {
		const log: string[] = [];
		const config = ok(load(`assert(obsidian.platform.desktop == true and obsidian.platform.os == "linux")
			assert(#obsidian.commands() == 4)
			vim.keymap.set("n", "x", function()
				assert(obsidian.command("editor:save-file") == true)
				assert(obsidian.action("native:copy") == "handled")
			end)
			vim.keymap.set("n", "y", obsidian.run("native:paste"))`, {}, host(log)));
		config.luaActions[0]?.run(context);
		config.luaActions[1]?.run(context);
		expect(log).toEqual(["command editor:save-file", "action native:copy", "action native:paste"]);
	});

	test("the sandbox has no file, os or debug access", () => {
		ok(load(`assert(os == nil and io == nil and debug == nil and dofile == nil and loadfile == nil and coroutine == nil)`));
	});

	test("the small standard library works", () => {
		ok(load(`assert(vim.trim("  a ") == "a")
			assert(vim.startswith("abc", "ab") and vim.endswith("abc", "bc"))
			local parts = vim.split("a,b", ",", { plain = true })
			assert(#parts == 2 and parts[2] == "b")
			assert(vim.tbl_contains({ 1, 2 }, 2) and #vim.tbl_keys({ a = 1 }) == 1 and #vim.tbl_values({ a = 1 }) == 1)
			assert(vim.tbl_extend("force", { a = 1 }, { a = 2 }).a == 2)
			assert(vim.inspect({ a = 1 }) == "{ a = 1 }")`));
	});
});
