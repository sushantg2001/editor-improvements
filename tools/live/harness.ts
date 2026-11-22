// The context every live check runs with.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listTargets, Page, sleep } from "./cdp";
import { focusTestWindow } from "./focus";
import { parseKey } from "./keys";
import { FIXTURE_VAULT, type Instance, PLUGIN_ID } from "./launch";

const XKEY = join(import.meta.dir, "xkey.py");
const ROUTER = readFileSync(join(import.meta.dir, "probes/router.js"), "utf8");
const NOTES = ["spec.md", "table.md", "card.canvas"];

/** One live check, in its own file under `tools/live/checks/`. */
export interface Check {
	name: string;
	/** The facts or requirements this check proves. */
	covers: string[];
	/** Also runs under mobile emulation. */
	mobile?: boolean;
	/** Runs only under mobile emulation. */
	mobileOnly?: boolean;
	/** Needs real OS key presses, so it runs only with `--real-keys`. */
	realKeys?: boolean;
	run(t: Harness): Promise<void>;
}

/** Helpers every check gets in the page: a log, a scope factory and a hotkey command. */
const PROBE = `(() => {
	window.__log = [];
	window.__scope = (handler, parent) => {
		const scope = new app.scope.constructor(parent === undefined ? app.workspace.scope : parent);
		scope.register(null, null, handler);
		app.keymap.pushScope(scope);
		return scope;
	};
	if (!app.commands.findCommand("probe:hk")) {
		app.commands.addCommand({ id: "probe:hk", name: "probe hk", callback() { window.__log.push("cmd:hk"); } });
		app.hotkeyManager.setHotkeys("probe:hk", [{ modifiers: ["Ctrl", "Alt"], key: "k" }]);
	}
	return true;
})()`;

class Expectation {
	constructor(private readonly actual: unknown, private readonly label?: string) {}

	private fail(wanted: string): never {
		const prefix = this.label ? `${this.label}: ` : "";
		throw new Error(`${prefix}expected ${wanted}, got ${JSON.stringify(this.actual)}`);
	}

	toBe(expected: unknown): void {
		if (!Object.is(this.actual, expected)) this.fail(JSON.stringify(expected));
	}

	toEqual(expected: unknown): void {
		if (!Bun.deepEquals(this.actual, expected)) this.fail(JSON.stringify(expected));
	}

	toContain(item: unknown): void {
		const found = Array.isArray(this.actual) ? this.actual.includes(item) : String(this.actual).includes(String(item));
		if (!found) this.fail(`something containing ${JSON.stringify(item)}`);
	}

	notToContain(item: unknown): void {
		const found = Array.isArray(this.actual) ? this.actual.includes(item) : String(this.actual).includes(String(item));
		if (found) this.fail(`nothing containing ${JSON.stringify(item)}`);
	}

	toBeLessThan(limit: number): void {
		if (typeof this.actual !== "number" || !(this.actual < limit)) this.fail(`a number below ${limit}`);
	}
}

export class Harness {
	/** Measurements a check reports in its result line. */
	details: Record<string, unknown> = {};
	private cleanups: (() => Promise<unknown>)[] = [];

	constructor(readonly instance: Instance, readonly mobile: boolean) {}

	get page(): Page {
		return this.instance.page;
	}

	eval<T = unknown>(expression: string): Promise<T> {
		return this.page.eval<T>(expression);
	}

	expect(actual: unknown, label?: string): Expectation {
		return new Expectation(actual, label);
	}

	sleep(ms: number): Promise<void> {
		return sleep(ms);
	}

	/** Runs `fn` when the check ends, last registered first, even on failure. */
	cleanup(fn: () => Promise<unknown>): void {
		this.cleanups.push(fn);
	}

	async runCleanups(): Promise<void> {
		for (const fn of this.cleanups.reverse()) {
			try {
				await fn();
			} catch {
				// The next check starts from a reload.
			}
		}
		this.cleanups = [];
	}

	/** Reloads the window through `action` and waits until it is ready again. */
	private async reloadWith(action: () => Promise<unknown>): Promise<void> {
		await this.eval("window.__beforeReload = true");
		await action();
		const deadline = Date.now() + 45_000;
		for (;;) {
			try {
				if (await this.eval<boolean>("window.__beforeReload === undefined")) break;
			} catch {
				// The page is between navigations.
			}
			if (Date.now() > deadline) throw new Error("the window did not reload");
			await sleep(50);
		}
		await this.instance.waitReady();
	}

	/** Gives the next check a fresh window and the fixture notes. */
	async prepare(): Promise<void> {
		this.details = {};
		await this.eval(`(() => {
			const popouts = [];
			app.workspace.iterateAllLeaves((leaf) => { if (leaf.getContainer().win !== window) popouts.push(leaf); });
			popouts.forEach((leaf) => leaf.detach());
			return true;
		})()`);
		// The layout save is debounced. Without this, a closed popout comes back on reload.
		await sleep(100);
		await this.eval("app.workspace.saveLayout()");
		await this.reloadWith(() => this.page.send("Page.reload"));
		const extra = (await listTargets(this.instance.port)).filter((target) => target.type === "page" && !target.url.includes("index.html"));
		if (extra.length > 0) throw new Error(`${extra.length} popout window(s) survived the reload`);
		const notes = Object.fromEntries(NOTES.map((name) => [name, readFileSync(join(FIXTURE_VAULT, name), "utf8")]));
		await this.eval(`(async () => {
			const notes = ${JSON.stringify(notes)};
			for (const [path, text] of Object.entries(notes)) await app.vault.modify(app.vault.getFileByPath(path), text);
			return true;
		})()`);
		await this.eval(PROBE);
	}

	/** Switches mobile emulation, which reloads the window. */
	async setMobile(on: boolean): Promise<void> {
		await this.eval(on ? `localStorage.setItem("vim", "true")` : `localStorage.removeItem("vim")`);
		await this.reloadWith(() => this.page.send("Runtime.evaluate", { expression: `setTimeout(() => app.emulateMobile(${on}), 0); true` }));
	}

	/** Presses one key over the DevTools Protocol. */
	async press(key: string, options: { repeat?: boolean; commands?: string[]; page?: Page } = {}): Promise<void> {
		await (options.page ?? this.page).key(parseKey(key), options);
		await sleep(80);
	}

	async pressKeys(...keys: string[]): Promise<void> {
		for (const key of keys) await this.press(key);
	}

	/** Presses the hotkey of the probe command. */
	hotkey(page?: Page): Promise<void> {
		return this.press("<C-A-k>", page ? { page } : {});
	}

	/** A trusted left click at page coordinates. */
	async click(x: number, y: number): Promise<void> {
		const mouse = { x, y, button: "left", clickCount: 1 };
		await this.page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
		await this.page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse });
		await sleep(500);
	}

	/** Returns and empties the page's log. */
	log(): Promise<string[]> {
		return this.eval<string[]>("window.__log.splice(0)");
	}

	/** Opens a note in Live Preview and focuses its editor. */
	async openNote(path: string): Promise<void> {
		await this.eval(`(async () => {
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(app.vault.getFileByPath(${JSON.stringify(path)}), { state: { mode: "source", source: false } });
			app.workspace.setActiveLeaf(leaf, { focus: true });
			await new Promise((resolve) => setTimeout(resolve, 400));
			app.workspace.activeEditor.editor.focus();
			return true;
		})()`);
	}

	/** Runs `body` with `ed` bound to the active editor. */
	editor<T = unknown>(body: string): Promise<T> {
		return this.eval<T>(`(() => { const ed = app.workspace.activeEditor.editor; ${body} })()`);
	}

	/** The text of a line, counted from 0 as Obsidian's editor does. */
	lineText(line: number): Promise<string> {
		return this.editor<string>(`return ed.getLine(${line});`);
	}

	vimMode(): Promise<string> {
		return this.editor<string>(`const v = ed.cm.cm.state.vim; return v.insertMode ? "insert" : v.visualMode ? "visual" : "normal";`);
	}

	/** Installs the probe router on the main window and removes it when the check ends. */
	async installRouter(): Promise<void> {
		await this.eval(ROUTER);
		await this.eval("(window.__R.install(window), true)");
		this.cleanup(() => this.eval("window.__R && window.__R.restore()"));
	}

	/** The plugin's state: inactive, active or safe. */
	pluginState(): Promise<string> {
		return this.eval<string>(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].lifecycle.state`);
	}

	/** Writes a config and sets the plugin up. It is put back when the check ends. */
	async activatePlugin(config: string): Promise<void> {
		this.cleanup(() => this.deactivatePlugin());
		await this.writeConfig(config);
		await this.eval(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].lifecycle.setUp()`);
	}

	/** Writes `init.lua` in the plugin's config folder. */
	writeConfig(config: string): Promise<unknown> {
		return this.eval(`(async () => {
			const adapter = app.vault.adapter;
			const folder = app.vault.configDir + "/editor-improvements";
			if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
			await adapter.write(folder + "/init.lua", ${JSON.stringify(config)});
			return true;
		})()`);
	}

	private deactivatePlugin(): Promise<unknown> {
		const id = JSON.stringify(PLUGIN_ID);
		return this.eval(`(async () => {
			const prefix = "editor-improvements:" + app.appId + ":";
			localStorage.setItem(prefix + "setup", JSON.stringify("declined"));
			localStorage.removeItem(prefix + "safe-mode");
			await app.plugins.disablePlugin(${id});
			await app.vault.saveConfig();
			const folder = app.vault.configDir + "/editor-improvements";
			if (await app.vault.adapter.exists(folder)) await app.vault.adapter.rmdir(folder, true);
			await app.plugins.enablePlugin(${id});
			return true;
		})()`);
	}

	/** Reloads the window in the middle of a check. */
	async reloadWindow(): Promise<void> {
		await this.eval("app.workspace.saveLayout()");
		await this.reloadWith(() => this.page.send("Page.reload"));
		await this.eval(PROBE);
	}

	/** Waits until an expression in the page is true. */
	async waitFor(expression: string, timeoutMs = 4000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (!(await this.eval<boolean>(expression))) {
			if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expression}`);
			await sleep(50);
		}
	}

	/** Opens a note in a popout window and returns that window's page. */
	async openPopout(path: string): Promise<Page> {
		const before = new Set((await listTargets(this.instance.port)).map((target) => target.id));
		await this.eval(`(async () => {
			window.__popout = app.workspace.openPopoutLeaf();
			await window.__popout.openFile(app.vault.getFileByPath(${JSON.stringify(path)}));
			await new Promise((resolve) => setTimeout(resolve, 1200));
			return true;
		})()`);
		const popout = await Page.connect(this.instance.port, (target) => !before.has(target.id));
		this.cleanup(async () => {
			await this.eval("window.__popout.detach()");
			popout.close();
		});
		await popout.eval(`(() => { const content = document.querySelector(".cm-content"); if (content) content.focus(); return true; })()`);
		await sleep(300);
		return popout;
	}

	/** Saves the system clipboard now and puts it back when the check ends. */
	async keepClipboard(): Promise<void> {
		await this.eval(`(() => {
			const { clipboard } = window.require("electron");
			window.__clipboard = { text: clipboard.readText(), html: clipboard.readHTML(), image: clipboard.readImage() };
			// What you had copied can be a secret, so no check may ever read or report it.
			clipboard.writeText("e2e-clipboard-placeholder");
			return true;
		})()`);
		this.cleanup(() =>
			this.eval(`(() => {
				const { clipboard } = window.require("electron");
				const saved = window.__clipboard;
				const data = {};
				if (saved.text) data.text = saved.text;
				if (saved.html) data.html = saved.html;
				if (!saved.image.isEmpty()) data.image = saved.image;
				if (Object.keys(data).length) clipboard.write(data); else clipboard.clear();
				return true;
			})()`),
		);
	}

	/** Presses a real OS key, such as `Control_L+c`, into the confirmed test window. */
	async realKey(combo: string): Promise<void> {
		await this.page.setFocusEmulation(false);
		try {
			const token = await focusTestWindow(this.page, this.instance.dir);
			const result = spawnSync("python3", ["-I", XKEY, "--token", token, combo], { encoding: "utf8" });
			if (result.status !== 0) throw new Error(`xkey: ${result.stderr.trim()}`);
		} finally {
			await this.page.setFocusEmulation(true);
		}
		await sleep(200);
	}
}
