import { describe, expect, test } from "bun:test";
import manifest from "../../manifest.json";
import pkg from "../../package.json";
import { BUDGET_BYTES, overBudget } from "../../tools/release/size";

describe("repository rules", () => {
	test("REPO-R4: every dependency is pinned to an exact version", () => {
		const all: Record<string, string> = {
			...(pkg as { dependencies?: Record<string, string> }).dependencies,
			...pkg.devDependencies,
		};
		const loose = Object.entries(all).filter(([, range]) => !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(range));
		expect(loose).toEqual([]);
	});

	test("REPO-R8: the manifest has the plugin id and runs on mobile", () => {
		expect(manifest.id).toBe("editor-improvements");
		expect(manifest.isDesktopOnly).toBe(false);
	});

	test("REPO: package.json and manifest.json carry the same version", () => {
		expect(manifest.version).toBe(pkg.version);
	});

	test("REPO: the size check fails only over the 1.5 MB budget", () => {
		expect(overBudget(BUDGET_BYTES)).toBeNull();
		expect(overBudget(BUDGET_BYTES + 1)).toContain("over the budget");
	});
});
