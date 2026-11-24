import type { Extension } from "@codemirror/state";
import { apiVersion, debounce, type EventRef, FileSystemAdapter, Platform, type Plugin, TFile } from "obsidian";
import { openExternally } from "../actions/native/desktop";
import { nativeActions } from "../actions/native/index";
import { type ActionDef, type ActionRegistry, activeEditorView } from "../actions/registry";
import type { DeviceState } from "../device-state";
import { log } from "../diagnostics/log";
import type { Engine, EngineMode } from "../engine/engine";
import { type CompiledConfig, type ConfigHost, runConfig } from "../lua/config";
import { readConfigFiles } from "../lua/files";
import { STARTER_CONFIG } from "../lua/starter";
import { keysToString } from "../notation/parse";
import { type KeyRouter, PROBE_CODE } from "../router/dispatch";
import type { ScopeInstaller } from "../router/install";
import { normalizeSettings, type Settings } from "../settings";
import { notify, notifyOnce } from "../ui/notices";
import { EditorSettingTab } from "../ui/settings-tab";
import { SetupModal } from "../ui/setup-modal";
import { StatusBar, type UiController } from "../ui/status-bar";
import { builtinVimOn, setBuiltinVim } from "./builtin-vim";
import { Changes } from "./changes";
import { findConflict } from "./conflicts";
import { ErrorBudget } from "./error-budget";
import { selfTest } from "./self-test";

const MODE_NAMES: Record<EngineMode, string> = { n: "NORMAL", i: "INSERT", v: "VISUAL", x: "V-LINE", o: "O-PENDING", R: "REPLACE", c: "COMMAND" };
const RELOAD_DELAY_MS = 300;
const CONFIG_REASON = "the config failed to load";

export interface LifecycleDeps {
	plugin: Plugin;
	engine: Engine;
	actions: ActionRegistry;
	router: KeyRouter;
	installer: ScopeInstaller;
	device: DeviceState;
}

/** Brings the plugin up and down, and owns its state. */
export class Lifecycle implements UiController {
	state: "inactive" | "active" | "safe" = "inactive";
	reason = "";
	configErrors: string[] = [];
	private settings: Settings = normalizeSettings(null);
	private readonly changes = new Changes();
	private readonly extensions: Extension[] = [];
	private readonly budget = new ErrorBudget();
	private luaUnregister: (() => void)[] = [];
	private hasGoodConfig = false;
	private status: StatusBar | null = null;

	constructor(private readonly deps: LifecycleDeps) {}

	private get app() {
		return this.deps.plugin.app;
	}

	/** Read through a getter, because the state can change across an await. */
	private get isInactive(): boolean {
		return this.state === "inactive";
	}

	get configFolder(): string {
		return this.settings.configFolder;
	}

	get configPath(): string {
		return this.settings.configFolder || `${this.app.vault.configDir}/editor-improvements`;
	}

	async load(): Promise<void> {
		const { plugin, actions } = this.deps;
		this.settings = normalizeSettings(await plugin.loadData());
		plugin.registerEditorExtension(this.extensions);
		for (const def of [...nativeActions(this.app, this.deps.engine), ...this.pluginActions()]) {
			plugin.register(actions.register(def));
			plugin.addCommand({
				id: def.id.replace(":", "-"),
				name: def.title,
				checkCallback: (checking) => {
					if (this.state === "inactive" && def.id !== "plugin:set-up") return false;
					if (!checking) actions.run(def.id, { classified: null, event: null });
					return true;
				},
			});
		}
		this.status = new StatusBar(plugin, this);
		plugin.addRibbonIcon("shield", "Editor Improvements: toggle safe mode", () => {
			if (this.state === "inactive") notify(this.reason ? `not active, ${this.reason}.` : "not active.");
			else this.toggleSafeMode();
		});
		plugin.addSettingTab(new EditorSettingTab(this.app, plugin, this));

		const reloadSoon = debounce(() => void this.reload(), RELOAD_DELAY_MS, true);
		const onRaw = (path: string): void => {
			if (this.state !== "inactive" && path.startsWith(`${this.configPath}/`) && path.endsWith(".lua")) reloadSoon();
		};
		plugin.registerEvent((this.app.vault as unknown as { on(name: "raw", callback: (path: string) => void): EventRef }).on("raw", onRaw));
		plugin.registerEvent(this.app.workspace.on("window-open", (_, win) => {
			// Obsidian sets the popout's base scope after this event.
			window.setTimeout(() => {
				if (this.state !== "inactive") this.deps.installer.addWindow(win);
			}, 0);
		}));
		plugin.registerEvent(this.app.workspace.on("window-close", (_, win) => this.deps.installer.removeWindow(win)));
		plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => this.status?.refresh()));
		this.app.workspace.onLayoutReady(() => void this.start());
	}

	unload(): void {
		this.deactivate();
	}

	private pluginActions(): ActionDef[] {
		const define = (name: string, title: string, run: () => void): ActionDef => ({
			id: `plugin:${name}`,
			title,
			repeatable: false,
			run: () => {
				run();
				return "handled";
			},
		});
		return [
			define("reload", "Reload config", () => void this.reload()),
			define("safe-mode", "Toggle safe mode", () => this.toggleSafeMode()),
			define("open-config", "Open config", () => this.openConfig()),
			define("set-up", "Set up", () => void this.setUp()),
		];
	}

	private async start(): Promise<void> {
		// 1.0.0 is for desktop. On a phone or tablet it stays inactive and changes nothing.
		if (Platform.isMobile) {
			this.reason = "this version supports desktop only";
			return;
		}
		const setup = this.deps.device.get("setup");
		if (setup === "done") await this.activate();
		else if (setup === null) this.askToSetUp();
		else this.reason = "not set up";
	}

	private askToSetUp(): void {
		new SetupModal(this.app, this.configPath, (accepted) => {
			if (accepted) void this.setUp();
			else {
				this.deps.device.set("setup", "declined");
				this.reason = "not set up";
			}
		}).open();
	}

	/** Creates the config if needed, and turns the plugin on. */
	async setUp(): Promise<void> {
		if (Platform.isMobile) {
			notify("this version supports desktop only.");
			return;
		}
		if (this.state !== "inactive") return;
		const { adapter } = this.app.vault;
		const init = `${this.configPath}/init.lua`;
		if (!(await adapter.exists(init))) {
			if (!(await adapter.exists(this.configPath))) await adapter.mkdir(this.configPath);
			await adapter.write(init, STARTER_CONFIG);
		}
		this.deps.device.set("setup", "done");
		await this.activate();
	}

	private async activate(): Promise<void> {
		if (this.state !== "inactive") return;
		const { device, engine, installer } = this.deps;
		const conflict = findConflict(this.app);
		const problem = conflict ? `${conflict} is enabled. Turn it off, then reload this plugin` : selfTest(this.app);
		if (problem) {
			this.reason = problem;
			notifyOnce(`not active. ${problem}.`);
			this.status?.refresh();
			return;
		}
		try {
			// Kept in device state because a window reload skips the plugin's unload.
			const previous = device.get("builtin-vim")?.previous ?? builtinVimOn(this.app);
			device.set("builtin-vim", { previous });
			if (builtinVimOn(this.app)) setBuiltinVim(this.app, false);
			this.changes.add("built-in vim", () => {
				setBuiltinVim(this.app, previous);
				device.remove("builtin-vim");
			});

			this.extensions.push(engine.extension());
			this.updateEditors();
			this.changes.add("engine", () => {
				this.extensions.length = 0;
				this.updateEditors();
				engine.release();
			});

			installer.install();
			for (const win of this.openWindows()) installer.addWindow(win);
			this.changes.add("router scope", () => installer.uninstall());
			this.changes.add("hotkeys", () => installer.release());
			this.changes.add("lua actions", () => this.dropLuaActions());

			this.state = "active";
			this.reason = "";
			const safe = device.get("safe-mode");
			const loaded = await this.reload();
			if (this.isInactive) return;
			if (safe) this.enterSafe(safe.reason, true);
			else if (loaded) this.takeOver();
		} catch (error) {
			log("error", "lifecycle", String(error));
			this.deactivate();
			this.reason = `failed to start: ${error instanceof Error ? error.message : String(error)}`;
			notifyOnce(`not active, ${this.reason}.`);
		}
		this.status?.refresh();
	}

	private deactivate(): void {
		this.changes.undoAll();
		this.deps.router.setSafeMode(false);
		this.deps.router.setKeymap([], 1000, true);
		this.hasGoodConfig = false;
		this.state = "inactive";
		this.status?.refresh();
	}

	private updateEditors(): void {
		(this.app.workspace as unknown as { updateOptions(): void }).updateOptions();
	}

	private openWindows(): Set<Window> {
		const windows = new Set<Window>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const win = leaf.getContainer().win;
			if (win !== window) windows.add(win);
		});
		return windows;
	}

	private takeOver(): void {
		const { installer, router } = this.deps;
		if (!installer.takeover()) {
			this.enterSafe("Obsidian's hotkey handler was not found", false);
			return;
		}
		router.probeSeen = false;
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "F24", code: PROBE_CODE, bubbles: true, cancelable: true }));
		if (!router.probeSeen) this.enterSafe("the key router did not receive a test key", false);
	}

	private enterSafe(reason: string, persist: boolean): void {
		const { device, installer, router } = this.deps;
		router.setSafeMode(true);
		installer.release();
		this.state = "safe";
		this.reason = reason;
		if (persist) device.set("safe-mode", { reason });
		notify(`safe mode, ${reason}. Obsidian's hotkeys are back. Press Ctrl+Alt+Shift+F12 to leave.`, 10);
		this.status?.refresh();
	}

	private leaveSafe(): void {
		const { device, router } = this.deps;
		device.remove("safe-mode");
		this.budget.reset();
		router.setSafeMode(false);
		this.state = "active";
		this.reason = "";
		this.takeOver();
		if (this.state === "active") notify("safe mode off. Your keymap is active.");
		this.status?.refresh();
	}

	toggleSafeMode(): void {
		if (this.state === "active") {
			this.enterSafe("turned on by you", true);
		} else if (this.state === "safe") {
			if (this.hasGoodConfig) {
				this.leaveSafe();
			} else {
				this.deps.device.remove("safe-mode");
				void this.reload().then((loaded) => {
					if (loaded && this.state === "safe") this.leaveSafe();
				});
			}
		}
	}

	/** Called for every key the router handled, and for every failed action. */
	reportError(): void {
		if (this.state === "active" && this.budget.record()) this.enterSafe("too many errors in a short time", true);
	}

	onKeyHandled(): void {
		this.status?.refresh();
	}

	private configHost(): ConfigHost {
		return {
			app: this.app,
			engine: this.deps.engine,
			actions: this.deps.actions,
			platform: {
				desktop: Platform.isDesktopApp,
				mobile: Platform.isMobile,
				os: Platform.isMacOS ? "macos" : Platform.isWin ? "windows" : Platform.isLinux ? "linux" : "unknown",
				version: apiVersion,
			},
			notify: (message, level) => {
				if (level >= 2) notify(message);
			},
		};
	}

	/** Loads the config. A failure keeps the last good keymap running. */
	async reload(): Promise<boolean> {
		if (this.state === "inactive") return false;
		let result;
		try {
			result = runConfig(await readConfigFiles(this.app.vault.adapter, this.configPath), this.configHost());
		} catch (error) {
			result = { ok: false as const, error: error instanceof Error ? error.message : String(error) };
		}
		if (this.isInactive) return false;
		if (!result.ok) {
			this.configErrors = [result.error];
			notifyOnce(`config error: ${result.error}`);
			if (!this.hasGoodConfig && this.state === "active") this.enterSafe(CONFIG_REASON, false);
			return false;
		}
		this.swap(result.config);
		if (this.state === "safe" && this.reason === CONFIG_REASON) this.leaveSafe();
		return true;
	}

	/** Replaces the keymap and engine state in one step, so no key lands between them. */
	private swap(config: CompiledConfig): void {
		const { actions, engine, router } = this.deps;
		this.dropLuaActions();
		this.luaUnregister = config.luaActions.map((def) => actions.register(def));
		const problems = actions.validate(config.mappings.map((mapping) => mapping.action));
		const broken = new Set(problems.map((problem) => problem.id));
		// A command can appear later, when its plugin loads, so its mapping stays in place.
		const mappings = config.mappings.filter((mapping) => !broken.has(mapping.action) || mapping.action.startsWith("obsidian:"));
		const errors = config.mappings
			.filter((mapping) => broken.has(mapping.action))
			.map((mapping) => `${keysToString(mapping.keys)} in ${mapping.context}: ${mapping.action} is not available`);
		errors.push(...engine.apply(config.engine));
		router.setKeymap(mappings, config.timeoutlen, config.strictkeys);
		this.hasGoodConfig = true;
		this.configErrors = errors;
		for (const error of errors) notifyOnce(`config: ${error}`);
		this.status?.refresh();
	}

	private dropLuaActions(): void {
		for (const unregister of this.luaUnregister) unregister();
		this.luaUnregister = [];
	}

	openConfig(): void {
		const { adapter } = this.app.vault;
		const path = `${this.configPath}/init.lua`;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		else if (adapter instanceof FileSystemAdapter) openExternally(adapter.getFullPath(path));
	}

	async saveConfigFolder(folder: string): Promise<void> {
		const next = normalizeSettings({ configFolder: folder });
		if (next.configFolder === this.settings.configFolder) return;
		this.settings = next;
		await this.deps.plugin.saveData(this.settings);
		await this.reload();
	}

	statusText(): string {
		if (this.state === "inactive") return "";
		if (this.state === "safe") return "SAFE MODE";
		const pending = this.deps.router.pending;
		if (pending) return `PENDING ${keysToString(pending)}`;
		const view = activeEditorView(this.app);
		if (view?.hasFocus && this.deps.engine.isAttached(view)) return MODE_NAMES[this.deps.engine.mode(view)];
		return "GLOBAL";
	}
}
