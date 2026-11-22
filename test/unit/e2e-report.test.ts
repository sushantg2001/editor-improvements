import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checks } from "../../tools/live/checks/index";
import { type E2EReport, renderMarkdown, requiredRuns, verifyReport } from "../../tools/release/e2e-report";
import pkg from "../../package.json";

const root = join(import.meta.dir, "../..");
const expected = {
	version: "1.2.3",
	commit: "abc",
	artifacts: { "main.js": "h1", "manifest.json": "h2" },
	required: ["desktop:one", "desktop:two", "mobile:two"],
};
const run = (check: string, mode: "desktop" | "mobile", pass = true) => ({ check, mode, covers: ["V1"], pass, ms: 1000, details: pass ? {} : { error: "boom" } });
const good = (): E2EReport => ({
	schema: 1,
	version: "1.2.3",
	commit: "abc",
	dirty: false,
	pass: true,
	obsidian: "1.15.1",
	platform: "linux, KDE",
	finishedAt: "2026-11-23T00:00:00.000Z",
	artifacts: { "main.js": "h1", "manifest.json": "h2" },
	runs: [run("one", "desktop"), run("two", "desktop"), run("two", "mobile")],
});

describe("end-to-end report", () => {
	test("a complete passing report for this build is accepted", () => {
		expect(verifyReport(good(), expected)).toEqual([]);
	});

	test.each([
		["another version", { version: "1.2.2" }, "version"],
		["another commit", { commit: "def" }, "commit"],
		["uncommitted changes", { dirty: true }, "uncommitted"],
		["a failed result", { pass: false }, "did not pass"],
		["a different build", { artifacts: { "main.js": "other", "manifest.json": "h2" } }, "differ"],
		["a missing release file", { artifacts: { "main.js": "h1" } }, "differ"],
		["an extra release file", { artifacts: { "main.js": "h1", "manifest.json": "h2", "styles.css": "h3" } }, "differ"],
	])("%s is refused", (_, change, message) => {
		expect(verifyReport({ ...good(), ...change }, expected).join(" ")).toContain(message);
	});

	test("a failed, missing, unknown or repeated run is refused", () => {
		expect(verifyReport({ ...good(), runs: [run("one", "desktop", false), run("two", "desktop"), run("two", "mobile")] }, expected)).toEqual(["desktop:one failed"]);
		expect(verifyReport({ ...good(), runs: [run("one", "desktop"), run("two", "desktop")] }, expected)).toEqual(["mobile:two did not run"]);
		expect(verifyReport({ ...good(), runs: [...good().runs, run("old", "desktop")] }, expected)).toEqual(["desktop:old is not in the suite"]);
		expect(verifyReport({ ...good(), runs: [...good().runs, run("one", "desktop")] }, expected)).toEqual(["desktop:one ran 2 times"]);
	});

	test("anything that is not a report is refused", () => {
		for (const bad of [null, "text", 1, {}, { schema: 2 }]) expect(verifyReport(bad, expected)).toHaveLength(1);
		expect(verifyReport({ ...good(), runs: "none" }, expected)).toContain("it has no list of runs");
	});

	test("the suite is every desktop check, including real keys, and the mobile checks", () => {
		const required = requiredRuns(checks);
		expect(required).toContain("desktop:real-keys-menu");
		expect(required).toContain("mobile:takeover");
		expect(required).toContain("mobile:emulate-mobile");
		expect(required).not.toContain("desktop:emulate-mobile");
		expect(required).not.toContain("mobile:real-keys-menu");
	});

	test("the Markdown shows the result and any failure", () => {
		expect(renderMarkdown(good())).toContain("**Result:** passed, 3 of 3 runs");
		const failed = { ...good(), pass: false, runs: [run("one", "desktop", false)] };
		expect(renderMarkdown(failed)).toContain("- **desktop:one:** boom");
	});
});

describe("where the end-to-end suite runs", () => {
	test("PR CI runs no end-to-end or live checks", () => {
		const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8").replace(/^\s*#.*$/gm, "");
		expect(ci).toContain("bun run gates");
		expect(ci).not.toMatch(/\be2e\b|run live|tools\/live/);
		expect(pkg.scripts.gates).not.toMatch(/\be2e\b|\blive\b/);
	});

	test("a release needs the report before your approval", () => {
		const release = Bun.YAML.parse(readFileSync(join(root, ".github/workflows/release.yml"), "utf8")) as {
			jobs: Record<string, { needs?: string; environment?: string; steps?: { run?: string }[] }>;
		};
		const { check, release: publish } = release.jobs;
		expect(check?.needs).toBe("e2e-report");
		expect(check?.steps?.some((step) => step.run?.includes("verify-e2e.ts"))).toBe(true);
		expect(publish?.needs).toBe("check");
		expect(publish?.environment).toBe("release");
		const steps = publish?.steps ?? [];
		const verified = steps.findIndex((step) => step.run?.includes("verify-e2e.ts"));
		const published = steps.findIndex((step) => step.run?.includes("gh release upload"));
		expect(verified).toBeGreaterThanOrEqual(0);
		expect(verified).toBeLessThan(published);
	});
});
