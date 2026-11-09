import { MarkdownView, Notice, Plugin } from "obsidian";

import { CommandSurface } from "./core/commands";
import { VimDispatcher } from "./core/dispatch";
import { getActiveCm, getActiveMarkdownView, getVimMode } from "./core/editor";
import { ModeTracker } from "./core/modes";
import { ModuleHost } from "./core/modules";
import { ActionRegistry } from "./core/registry";
import { EditorImprovementsRuntime } from "./core/runtime";
import { VimBridge, isVimEnabled } from "./core/vim-bridge";
import { MODULES } from "./modules";
import { ScriptHost } from "./scripts/loader";
import { scaffoldScripts } from "./scripts/scaffold";
import { EditorImprovementsSettingTab, mergeSettings, resolveScriptsFolder } from "./settings";
import { ModeStatusBar } from "./ui/status-bar";
import type { CodeMirrorShim, VimContext, EditorImprovementsSettings } from "./types";

/**
 * Wiring only.
 *
 * Everything the plugin can do lives in the registry as a contribution from
 * some source; `EditorImprovementsRuntime` is the only thing that projects the registry
 * onto vim's keymap and Obsidian's commands. This class builds those pieces,
 * hands them to each other, and otherwise stays out of the way.
 */
export default class EditorImprovementsPlugin extends Plugin {
	settings!: EditorImprovementsSettings;
	registry!: ActionRegistry;
	bridge!: VimBridge;
	modes!: ModeTracker;
	modulesHost!: ModuleHost;
	scripts!: ScriptHost;
	runtime!: EditorImprovementsRuntime;

	private statusBar: ModeStatusBar | null = null;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.addSettingTab(new EditorImprovementsSettingTab(this.app, this));

		this.registry = new ActionRegistry();
		this.bridge = this.addChild(new VimBridge(this.app));
		this.modes = this.addChild(new ModeTracker(this.app));

		const getVim = () => this.bridge.vim;
		const dispatcher = new VimDispatcher(
			this.app,
			this.registry,
			(cm) => this.buildContext(cm),
			getVim,
		);

		this.statusBar = new ModeStatusBar(this.addStatusBarItem(), () => this.settings);
		this.modes.onChange((mode) => this.statusBar?.render(mode));

		this.modulesHost = this.addChild(
			new ModuleHost({
				registry: this.registry,
				modules: MODULES,
				context: { app: this.app, getVim, settings: () => this.settings },
				onError: (module, error) => {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Editor Improvements: module "${module.id}" failed to start\n${message}`, 8000);
				},
			}),
		);

		this.scripts = this.addChild(
			new ScriptHost({
				app: this.app,
				registry: this.registry,
				getVim,
				isEnabled: () => this.settings.scriptsEnabled,
				getFolder: () => resolveScriptsFolder(this.app, this.settings),
				getLeader: () => this.settings.leader,
			}),
		);

		this.runtime = this.addChild(
			new EditorImprovementsRuntime({
				registry: this.registry,
				bridge: this.bridge,
				dispatcher,
				commands: new CommandSurface(this, this.registry, dispatcher, () =>
					getActiveCm(this.app),
				),
			}),
		);

		this.registerCommands();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.statusBar?.render(this.modes.current);
	}

	/**
	 * Picks up `data.json` being rewritten by Obsidian Sync or a third-party
	 * sync plugin. Without this, settings changed on another device are ignored
	 * and then overwritten by the next local save.
	 */
	async onExternalSettingsChange(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.statusBar?.render(this.modes.current);
		await this.reloadScripts();
	}

	/** Re-runs every script and reports what happened. */
	async reloadScripts(): Promise<void> {
		const result = await this.scripts.reload();
		if (!this.settings.scriptsEnabled || result.errors.length > 0) {
			// Errors already surfaced their own notice naming the file.
			return;
		}
		new Notice(
			result.loaded.length > 0
				? `Editor Improvements: loaded ${result.loaded.length} script(s).`
				: `Editor Improvements: no scripts found in ${this.scripts.folder}.`,
		);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "reload-config",
			name: "Reload configuration",
			callback: () => {
				this.bridge.refresh();
				this.modes.attachToActiveEditor();
				void this.reloadScripts();
			},
		});

		this.addCommand({
			id: "show-status",
			name: "Show status",
			callback: () => {
				if (!isVimEnabled(this.app)) {
					new Notice("Editor Improvements: vim mode is off. Enable it in Settings → Editor.");
					return;
				}
				const { loaded, errors } = this.scripts.result;
				new Notice(
					[
						`Editor Improvements: ${this.modes.current} mode`,
						`${this.registry.actions().length} actions, ${this.runtime.mappedKeyCount} keys`,
						this.settings.scriptsEnabled
							? `${loaded.length} script(s), ${errors.length} error(s)`
							: "scripts disabled",
					].join("\n"),
				);
			},
		});

		this.addCommand({
			id: "create-scripts-folder",
			name: "Create scripts folder with a starter init.js",
			callback: () => {
				void scaffoldScripts(
					this.app,
					resolveScriptsFolder(this.app, this.settings),
				).then(() => this.reloadScripts());
			},
		});
	}

	/**
	 * The markdown view that owns `cm`: the editor the key was typed in.
	 *
	 * Obsidian's idea of the active view can lag behind where keys are going, as
	 * with a hover popover or a second pane, and running an action against the
	 * active view then edits a different note. The active view is only the
	 * fallback, for an editor that is not an open markdown view.
	 */
	private viewFor(cm: CodeMirrorShim): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.editor.cm?.cm === cm) {
				return view;
			}
		}
		return getActiveMarkdownView(this.app);
	}

	/** Assembles everything an action needs, or null when there is no editor. */
	private buildContext(cm: CodeMirrorShim): VimContext | null {
		const view = this.viewFor(cm);
		const editorView = view?.editor.cm;
		if (!view || !editorView) {
			return null;
		}
		return {
			app: this.app,
			editor: view.editor,
			view: editorView,
			cm,
			mode: getVimMode(cm),
		};
	}
}
