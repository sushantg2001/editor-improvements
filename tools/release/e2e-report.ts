// The end-to-end report: what was tested, on which commit and build, and the result.
// It is written locally, attached to the draft release, and never committed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const REPORT_DIR = ".e2e";
export const REPORT_JSON = "e2e-report.json";
export const REPORT_MD = "e2e-report.md";
const RELEASE_FILES = ["main.js", "manifest.json", "styles.css"];

export type Mode = "desktop" | "mobile";

export interface E2ERun {
	check: string;
	mode: Mode;
	covers: string[];
	pass: boolean;
	ms: number;
	details: Record<string, unknown>;
}

export interface E2EReport {
	schema: 1;
	version: string;
	commit: string;
	/** True when the working copy had uncommitted changes. Such a report cannot be published. */
	dirty: boolean;
	pass: boolean;
	obsidian: string;
	platform: string;
	finishedAt: string;
	/** SHA-256 of each release file that was tested. */
	artifacts: Record<string, string>;
	runs: E2ERun[];
}

export interface Expected {
	version: string;
	commit: string;
	artifacts: Record<string, string>;
	/** Every run the suite must contain, as `mode:check`. */
	required: string[];
}

/** Hashes the release files that exist in `root`. */
export function hashReleaseFiles(root: string): Record<string, string> {
	const hashes: Record<string, string> = {};
	for (const name of RELEASE_FILES) {
		const path = join(root, name);
		if (existsSync(path)) hashes[name] = createHash("sha256").update(readFileSync(path)).digest("hex");
	}
	return hashes;
}

/** Every run a complete suite contains: all desktop checks, and the mobile ones under emulation. */
export function requiredRuns(checks: { name: string; mobile?: boolean; mobileOnly?: boolean }[]): string[] {
	return checks
		.flatMap((check) => [
			...(check.mobileOnly ? [] : [`desktop:${check.name}`]),
			...(check.mobile || check.mobileOnly ? [`mobile:${check.name}`] : []),
		])
		.sort();
}

function sameHashes(a: unknown, b: Record<string, string>): boolean {
	if (typeof a !== "object" || a === null) return false;
	const entries = Object.entries(a);
	return entries.length === Object.keys(b).length && entries.every(([name, hash]) => b[name] === hash);
}

/** Returns why a report cannot release this build. An empty list means it can. */
export function verifyReport(value: unknown, expected: Expected): string[] {
	if (typeof value !== "object" || value === null || (value as { schema?: unknown }).schema !== 1) {
		return ["the report is not a schema 1 end-to-end report"];
	}
	const report = value as Partial<E2EReport>;
	const errors: string[] = [];
	if (report.version !== expected.version) errors.push(`it tested version ${String(report.version)}, not ${expected.version}`);
	if (report.commit !== expected.commit) errors.push(`it tested commit ${String(report.commit)}, not ${expected.commit}`);
	if (report.dirty !== false) errors.push("it ran on a working copy with uncommitted changes");
	if (report.pass !== true) errors.push("it did not pass");
	if (!sameHashes(report.artifacts, expected.artifacts)) errors.push("the release files differ from the ones it tested");
	if (!Array.isArray(report.runs)) return [...errors, "it has no list of runs"];

	const counts = new Map<string, number>();
	for (const run of report.runs) {
		const id = `${run.mode}:${run.check}`;
		counts.set(id, (counts.get(id) ?? 0) + 1);
		if (run.pass !== true) errors.push(`${id} failed`);
	}
	for (const id of expected.required) {
		if (!counts.has(id)) errors.push(`${id} did not run`);
	}
	for (const [id, count] of counts) {
		if (!expected.required.includes(id)) errors.push(`${id} is not in the suite`);
		if (count > 1) errors.push(`${id} ran ${count} times`);
	}
	return errors;
}

/** The report as Markdown, for the draft release and the run summary you approve from. */
export function renderMarkdown(report: E2EReport): string {
	const passed = report.runs.filter((run) => run.pass).length;
	const lines = [
		`# End-to-end report for ${report.version}`,
		"",
		`**Result:** ${report.pass ? "passed" : "failed"}, ${passed} of ${report.runs.length} runs`,
		"",
		`- **Commit:** \`${report.commit}\``,
		`- **Obsidian:** ${report.obsidian}`,
		`- **Platform:** ${report.platform}`,
		`- **Finished:** ${report.finishedAt}`,
		`- **Uncommitted changes:** ${report.dirty ? "yes" : "no"}`,
		...Object.entries(report.artifacts).map(([name, hash]) => `- **${name}:** \`${hash}\``),
		"",
		"| Check | Mode | Result | Time |",
		"| --- | --- | --- | --- |",
		...report.runs.map((run) => `| ${run.check} | ${run.mode} | ${run.pass ? "pass" : "FAIL"} | ${(run.ms / 1000).toFixed(1)} s |`),
	];
	const failures = report.runs.filter((run) => !run.pass);
	if (failures.length > 0) {
		lines.push("", "## Failures", "", ...failures.map((run) => `- **${run.mode}:${run.check}:** ${String(run.details.error)}`));
	}
	return `${lines.join("\n")}\n`;
}
