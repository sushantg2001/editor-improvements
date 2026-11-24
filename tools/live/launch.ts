// Starts Obsidian with its own profile and a throwaway vault. It never opens the
// default profile or a real vault, so it is safe beside the user's own Obsidian.
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listTargets, Page, sleep } from "./cdp";

export const PLUGIN_ID = "editor-improvements";
export const DEFAULT_PORT = 9333;
const ROOT = resolve(import.meta.dir, "../..");
export const FIXTURE_VAULT = join(ROOT, "tools/live/vault");
const LOADER = "/usr/lib/obsidian/app.asar";
const START_TIMEOUT_MS = 45_000;

export interface LaunchOptions {
	/** An Obsidian `.asar` or executable. Defaults to the installed one. */
	obsidian?: string;
	port?: number;
	/** Symlink the plugin to the working copy's build instead of copying it. */
	linkPlugin?: boolean;
}

/** The newest Obsidian app the updater has fetched for this user, if any. */
function newestUpdatedAsar(): string | null {
	const dir = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "obsidian");
	if (!existsSync(dir)) return null;
	const found = readdirSync(dir).filter((name) => /^obsidian-\d+\.\d+\.\d+\.asar$/.test(name));
	found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	const newest = found.at(-1);
	return newest ? join(dir, newest) : null;
}

function installPlugin(vault: string, link: boolean): void {
	const dir = join(vault, ".obsidian/plugins", PLUGIN_ID);
	mkdirSync(dir, { recursive: true });
	for (const name of ["main.js", "manifest.json", "styles.css"]) {
		const source = join(ROOT, name);
		if (!existsSync(source)) continue;
		if (link) symlinkSync(source, join(dir, name));
		else copyFileSync(source, join(dir, name));
	}
}

async function portOpen(port: number): Promise<boolean> {
	try {
		await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
		return true;
	} catch {
		return false;
	}
}

/** One running test instance. Always end it with `stop()`. */
export class Instance {
	private stopped = false;

	constructor(
		readonly process: ChildProcess,
		readonly dir: string,
		readonly vault: string,
		readonly port: number,
		public page: Page,
	) {}

	/** Waits until the workspace is ready and, if asked, the plugin is loaded. */
	async waitReady(plugin = true): Promise<void> {
		const ready = `typeof app !== "undefined" && app.workspace.layoutReady === true${plugin ? ` && !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]` : ""}`;
		const deadline = Date.now() + START_TIMEOUT_MS;
		for (;;) {
			try {
				if (await this.page.eval<boolean>(ready)) return;
			} catch {
				// The page is between navigations.
			}
			if (Date.now() > deadline) throw new Error("Obsidian did not become ready");
			await sleep(100);
		}
	}

	/** Ends the process, closes the debugging port and deletes the profile and vault. */
	async stop(): Promise<void> {
		if (this.stopped) return;
		this.stopped = true;
		try {
			this.page.close();
		} catch {
			// Already closed.
		}
		const pid = this.process.pid;
		if (pid !== undefined) {
			try {
				process.kill(-pid, "SIGTERM");
			} catch {
				// Already gone.
			}
			for (let i = 0; i < 50 && (await portOpen(this.port)); i++) await sleep(100);
			try {
				process.kill(-pid, "SIGKILL");
			} catch {
				// Already gone.
			}
		}
		for (let i = 0; i < 30 && (await portOpen(this.port)); i++) await sleep(100);
		rmSync(this.dir, { recursive: true, force: true });
		if (await portOpen(this.port)) throw new Error(`debugging port ${this.port} is still open`);
	}
}

/** Starts an isolated Obsidian with the built plugin enabled. */
export async function launch(options: LaunchOptions = {}): Promise<Instance> {
	const port = options.port ?? DEFAULT_PORT;
	if (await portOpen(port)) throw new Error(`port ${port} is already in use`);
	if (!existsSync(join(ROOT, "main.js"))) throw new Error("main.js is missing: run `bun run build` first");

	const dir = mkdtempSync(join(tmpdir(), "editor-improvements-live-"));
	const profile = join(dir, "profile");
	const vault = join(dir, "vault");
	mkdirSync(profile);
	cpSync(FIXTURE_VAULT, vault, { recursive: true });
	installPlugin(vault, options.linkPlugin ?? false);
	writeFileSync(
		join(profile, "obsidian.json"),
		JSON.stringify({
			vaults: { [randomBytes(8).toString("hex")]: { path: vault, ts: Date.now(), open: true } },
			updateDisabled: true,
		}),
	);

	let command = "electron43";
	let args = [LOADER];
	if (options.obsidian?.endsWith(".asar")) {
		args = [resolve(options.obsidian)];
	} else if (options.obsidian) {
		command = resolve(options.obsidian);
		args = [];
	} else {
		// The loader runs the newest app it finds in its profile. A read-only copy
		// tests the version this machine actually runs.
		const asar = newestUpdatedAsar();
		if (asar && statSync(asar).isFile()) copyFileSync(asar, join(profile, asar.split("/").at(-1) ?? "obsidian.asar"));
	}
	args.push(`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--ozone-platform=x11");

	const env: NodeJS.ProcessEnv = { ...process.env, DISPLAY: process.env.DISPLAY ?? ":0" };
	delete env.ELECTRON_RUN_AS_NODE;
	const log = openSync(join(dir, "obsidian.log"), "a");
	const child = spawn(command, args, { detached: true, env, stdio: ["ignore", log, log] });

	try {
		const deadline = Date.now() + START_TIMEOUT_MS;
		let page: Page | null = null;
		while (!page) {
			if (child.exitCode !== null) throw new Error(`Obsidian exited with code ${child.exitCode}`);
			try {
				if ((await listTargets(port)).some((t) => t.type === "page" && t.url.includes("index.html"))) {
					page = await Page.connect(port, (t) => t.url.includes("index.html"));
				}
			} catch {
				// Not listening yet.
			}
			if (!page) {
				if (Date.now() > deadline) throw new Error("Obsidian did not open a debugging port");
				await sleep(150);
			}
		}
		const instance = new Instance(child, dir, vault, port, page);
		await instance.waitReady(false);
		const enabled = await page.eval<boolean>(`(async () => {
			// Stops the first-run prompt. Checks that need the plugin active turn it on themselves.
			localStorage.setItem("editor-improvements:" + app.appId + ":setup", JSON.stringify("declined"));
			await app.plugins.setEnable(true);
			await app.plugins.loadManifests();
			const enabled = await app.plugins.enablePluginAndSave(${JSON.stringify(PLUGIN_ID)});
			// The save above is debounced, and checks reload the window straight away.
			await app.plugins.saveConfig();
			return enabled;
		})()`);
		if (!enabled) throw new Error("the plugin did not enable");
		await instance.waitReady();
		return instance;
	} catch (error) {
		if (child.pid !== undefined) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// Already gone.
			}
		}
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}
