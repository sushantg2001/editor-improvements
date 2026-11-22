import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checks } from "../../tools/live/checks/index";
import { MOD, parseKey } from "../../tools/live/keys";

describe("live harness key notation", () => {
	test("a plain letter carries its text", () => {
		expect(parseKey("i")).toEqual({ key: "i", code: "KeyI", vk: 73, mods: 0, text: "i" });
	});

	test("a capital letter holds Shift", () => {
		expect(parseKey("Z")).toEqual({ key: "Z", code: "KeyZ", vk: 90, mods: MOD.shift, text: "Z" });
	});

	test("a chord has modifiers and no text", () => {
		expect(parseKey("<C-A-k>")).toEqual({ key: "k", code: "KeyK", vk: 75, mods: MOD.ctrl | MOD.alt });
	});

	test("named keys", () => {
		expect(parseKey("<Esc>")).toEqual({ key: "Escape", code: "Escape", vk: 27, mods: 0 });
		expect(parseKey("<CR>")).toEqual({ key: "Enter", code: "Enter", vk: 13, mods: 0, text: "\r" });
	});

	test("anything else is refused", () => {
		for (const bad of ["ab", "<Nope>", "<X-a>", "<C-a", "?"]) expect(() => parseKey(bad)).toThrow();
	});
});

describe("live checks", () => {
	test("every check file is in the list, under its own name", () => {
		const files = readdirSync(join(import.meta.dir, "../../tools/live/checks"))
			.filter((name) => name.endsWith(".ts") && name !== "index.ts")
			.map((name) => name.slice(0, -3))
			.sort();
		expect(checks.map((check) => check.name).sort()).toEqual(files);
	});

	test("TEST-R1: every check names what it proves", () => {
		expect(checks.filter((check) => check.covers.length === 0)).toEqual([]);
	});
});

describe("real key guard", () => {
	const xkey = join(import.meta.dir, "../../tools/live/xkey.py");
	const send = (token: string) => spawnSync("python3", ["-I", xkey, "--token", token, "Escape"], { encoding: "utf8" });

	// Each case refuses before it opens a display, so no key is ever sent.
	test("TEST-R6: xkey refuses without a focus token", () => {
		const result = send("/nonexistent/token.json");
		expect(result.status).toBe(2);
		expect(result.stderr).toContain("refused");
	});

	test("TEST-R6: xkey refuses a stale or malformed focus token", () => {
		const dir = mkdtempSync(join(tmpdir(), "xkey-"));
		try {
			const token = join(dir, "token.json");
			for (const content of [JSON.stringify({ pid: 1, at: Date.now() - 5000 }), JSON.stringify({ pid: 1, at: Date.now() + 60000 }), "{}", "not json"]) {
				writeFileSync(token, content);
				const result = send(token);
				expect(result.status).toBe(2);
				expect(result.stderr).toContain("refused");
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
