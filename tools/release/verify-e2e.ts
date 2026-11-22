// Checks that a published end-to-end report covers exactly this commit and build.
//   bun tools/release/verify-e2e.ts <report.json> <tag>
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checks } from "../live/checks/index";
import { type E2EReport, hashReleaseFiles, renderMarkdown, requiredRuns, verifyReport } from "./e2e-report";

const [file, tag] = process.argv.slice(2);
if (!file || !tag) throw new Error("usage: verify-e2e.ts <report.json> <tag>");

const root = resolve(import.meta.dir, "../..");
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();

let report: unknown;
let errors: string[];
try {
	report = JSON.parse(readFileSync(file, "utf8"));
	errors = verifyReport(report, { version: tag, commit, artifacts: hashReleaseFiles(root), required: requiredRuns(checks) });
} catch (error) {
	errors = [`the report cannot be read: ${String(error)}`];
}

if (errors.length > 0) {
	for (const error of errors) process.stderr.write(`::error::E2E report for ${tag}: ${error}\n`);
	process.exit(1);
}
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, renderMarkdown(report as E2EReport));
process.stdout.write(`The E2E report covers ${tag} at ${commit}.\n`);
