// Runs a list of live checks in one isolated Obsidian.
import { Harness, type Check } from "./harness";
import { launch, type LaunchOptions } from "./launch";

export interface CheckResult {
	check: string;
	covers: string[];
	pass: boolean;
	details: Record<string, unknown>;
	obsidian: string;
	mobile: boolean;
	ms: number;
}

/** Runs `checks` in order, reports each result, and always stops the instance. */
export async function runChecks(
	checks: Check[],
	mobile: boolean,
	launchOptions: LaunchOptions = {},
	onResult: (result: CheckResult) => void = () => {},
): Promise<CheckResult[]> {
	const instance = await launch(launchOptions);
	const stopOnSignal = (): void => void instance.stop().finally(() => process.exit(130));
	process.on("SIGINT", stopOnSignal);
	process.on("SIGTERM", stopOnSignal);
	const results: CheckResult[] = [];
	try {
		const obsidian = await instance.page.eval<string>(`window.require("electron").ipcRenderer.sendSync("version")`);
		const t = new Harness(instance, mobile);
		if (mobile) await t.setMobile(true);
		for (const check of checks) {
			const started = Date.now();
			let error: string | undefined;
			try {
				await t.prepare();
				await check.run(t);
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
			await t.runCleanups();
			const result: CheckResult = {
				check: check.name,
				covers: check.covers,
				pass: !error,
				details: error ? { error } : t.details,
				obsidian,
				mobile,
				ms: Date.now() - started,
			};
			results.push(result);
			onResult(result);
		}
		if (mobile) await t.setMobile(false);
	} finally {
		process.off("SIGINT", stopOnSignal);
		process.off("SIGTERM", stopOnSignal);
		await instance.stop();
	}
	return results;
}
