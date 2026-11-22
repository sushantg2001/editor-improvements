// The full end-to-end suite: every live check on desktop, with real keys, and
// under mobile emulation. Runs locally only. Writes the report to `.e2e/`.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type E2EReport, type E2ERun, hashReleaseFiles, renderMarkdown, REPORT_DIR, REPORT_JSON, REPORT_MD } from "../release/e2e-report";
import { checks } from "./checks/index";
import { type CheckResult, runChecks } from "./suite";

const root = resolve(import.meta.dir, "../..");

function git(...args: string[]): string {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
	return result.stdout.trim();
}

const commit = git("rev-parse", "HEAD");
const dirtyBefore = git("status", "--porcelain") !== "";
if (spawnSync("bun", ["run", "build"], { cwd: root, stdio: "inherit" }).status !== 0) throw new Error("the build failed");
const artifacts = hashReleaseFiles(root);

const print = (result: CheckResult): void => {
	process.stdout.write(`${result.pass ? "pass" : "FAIL"}  ${result.mobile ? "mobile " : "desktop"}  ${result.check}\n`);
};
const desktop = await runChecks(checks.filter((check) => !check.mobileOnly), false, {}, print);
const mobile = await runChecks(checks.filter((check) => check.mobile || check.mobileOnly), true, {}, print);

const unchanged = JSON.stringify(hashReleaseFiles(root)) === JSON.stringify(artifacts) && git("rev-parse", "HEAD") === commit;
if (!unchanged) throw new Error("the commit or the build changed during the run, so the results do not describe it");

const runs: E2ERun[] = [...desktop, ...mobile].map((result) => ({
	check: result.check,
	mode: result.mobile ? "mobile" : "desktop",
	covers: result.covers,
	pass: result.pass,
	ms: result.ms,
	details: result.details,
}));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const report: E2EReport = {
	schema: 1,
	version: pkg.version,
	commit,
	dirty: dirtyBefore || git("status", "--porcelain") !== "",
	pass: runs.every((run) => run.pass),
	obsidian: [...new Set([...desktop, ...mobile].map((result) => result.obsidian))].join(", "),
	platform: [process.platform, process.env.XDG_CURRENT_DESKTOP].filter(Boolean).join(", "),
	finishedAt: new Date().toISOString(),
	artifacts,
	runs,
};

const dir = join(root, REPORT_DIR);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, REPORT_JSON), `${JSON.stringify(report, null, "\t")}\n`);
writeFileSync(join(dir, REPORT_MD), renderMarkdown(report));

const passed = runs.filter((run) => run.pass).length;
process.stdout.write(`\n${report.pass ? "Passed" : "Failed"}: ${passed} of ${runs.length} runs on Obsidian ${report.obsidian}. Report: ${REPORT_DIR}/${REPORT_MD}\n`);
if (report.dirty) process.stdout.write("The working copy has uncommitted changes, so this report cannot be published.\n");
else if (report.pass) process.stdout.write("To attach it to the draft release: bun run e2e:publish\n");
process.exit(report.pass ? 0 : 1);
