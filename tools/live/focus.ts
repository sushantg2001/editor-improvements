// Activates the test window through a KWin script and confirms it holds focus,
// so real key presses can never land in another application.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, sleep } from "./cdp";

function busctl(...args: string[]): string {
	const result = spawnSync("busctl", ["--user", "call", "org.kde.KWin", ...args], { encoding: "utf8" });
	if (result.status !== 0) throw new Error(`busctl: ${result.stderr.trim()}`);
	return result.stdout;
}

/**
 * Focuses the window of `page`, which must have focus emulation off. Returns a
 * token file that `xkey.py` requires, valid for one second.
 */
export async function focusTestWindow(page: Page, dir: string): Promise<string> {
	const pid = await page.eval<number>(`window.require("@electron/remote").process.pid`);
	const script = join(dir, "focus.js");
	writeFileSync(
		script,
		`var ws = workspace.windowList(); for (var i = 0; i < ws.length; i++) { if (ws[i].pid === ${pid}) { workspace.activeWindow = ws[i]; } }`,
	);
	const name = `editor-improvements-focus-${pid}`;
	const id = busctl("/Scripting", "org.kde.kwin.Scripting", "loadScript", "ss", script, name).trim().split(/\s+/)[1];
	try {
		busctl(`/Scripting/Script${id}`, "org.kde.kwin.Script", "run");
	} finally {
		busctl("/Scripting", "org.kde.kwin.Scripting", "unloadScript", "s", name);
	}
	for (let i = 0; i < 40; i++) {
		if (await page.eval<boolean>("document.hasFocus()")) {
			const token = join(dir, "focus-token.json");
			writeFileSync(token, JSON.stringify({ pid, at: Date.now() }));
			return token;
		}
		await sleep(50);
	}
	throw new Error("the test window did not take focus");
}
