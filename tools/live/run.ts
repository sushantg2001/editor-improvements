// Runs chosen live checks while developing. Prints one JSON line per check and
// exits non-zero if any fails. The full release suite is `bun run e2e`.
//   bun run live -- --all [--mobile] [--real-keys] [--obsidian <path>]
//   bun run live -- popout-router takeover
import { checks as allChecks } from "./checks/index";
import type { Check } from "./harness";
import { runChecks } from "./suite";

function parseArgs(argv: string[]) {
	const options = { all: false, mobile: false, realKeys: false, obsidian: undefined as string | undefined, names: [] as string[] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		if (arg === "--all") options.all = true;
		else if (arg === "--mobile") options.mobile = true;
		else if (arg === "--real-keys") options.realKeys = true;
		else if (arg === "--obsidian") options.obsidian = argv[++i];
		else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
		else options.names.push(arg);
	}
	if (!options.all && options.names.length === 0) throw new Error("name some checks, or pass --all");
	return options;
}

function select(checks: Check[], options: ReturnType<typeof parseArgs>): Check[] {
	for (const name of options.names) {
		if (!checks.some((check) => check.name === name)) throw new Error(`no check named ${name}`);
	}
	return checks.filter((check) => {
		if (!options.all && !options.names.includes(check.name)) return false;
		if (options.mobile ? !(check.mobile || check.mobileOnly) : check.mobileOnly) return false;
		return options.realKeys ? true : !check.realKeys;
	});
}

const print = (line: unknown) => process.stdout.write(`${JSON.stringify(line)}\n`);

const options = parseArgs(process.argv.slice(2));
const checks = select(allChecks, options);
if (checks.length === 0) throw new Error("no checks to run");

const results = await runChecks(checks, options.mobile, options.obsidian ? { obsidian: options.obsidian } : {}, print);
process.exit(results.every((result) => result.pass) ? 0 : 1);
