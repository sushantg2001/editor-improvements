// Attaches a passing end-to-end report to the draft release for this version.
// It refuses a report that does not describe the current clean commit and build.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { checks } from "../live/checks/index";
import { hashReleaseFiles, REPORT_DIR, REPORT_JSON, REPORT_MD, requiredRuns, verifyReport } from "./e2e-report";

const root = resolve(import.meta.dir, "../..");

function stop(reason: string): never {
	process.stderr.write(`Not published: ${reason}\n`);
	process.exit(1);
}

function run(command: string, ...args: string[]): { ok: boolean; out: string; err: string } {
	const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
	return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

const json = join(root, REPORT_DIR, REPORT_JSON);
const markdown = join(root, REPORT_DIR, REPORT_MD);
if (!existsSync(json) || !existsSync(markdown)) stop("no report. Run `bun run e2e` first.");

if (run("git", "status", "--porcelain").out !== "") stop("the working copy has uncommitted changes.");
const commit = run("git", "rev-parse", "HEAD").out;
if (!run("git", "fetch", "--quiet", "origin", "main").ok) stop("could not fetch origin/main.");
if (!run("git", "merge-base", "--is-ancestor", commit, "origin/main").ok) stop(`${commit} is not on origin/main.`);

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const text = readFileSync(json, "utf8");
const errors = verifyReport(JSON.parse(text), { version, commit, artifacts: hashReleaseFiles(root), required: requiredRuns(checks) });
if (errors.length > 0) stop(errors.join("; "));
if (text.includes(homedir())) stop("the report contains your home folder path.");

const draft = run("gh", "release", "view", version, "--json", "isDraft", "--jq", ".isDraft");
if (draft.out !== "true") stop(`there is no draft release for ${version}. Merge the release PR and wait for the draft.`);

const upload = run("gh", "release", "upload", version, json, markdown, "--clobber");
if (!upload.ok) stop(upload.err);
process.stdout.write(`Published the E2E report to the draft release ${version}.\n`);
