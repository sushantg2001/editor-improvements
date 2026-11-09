import { Component } from "obsidian";
import type { App } from "obsidian";

import type { ActionRegistry, Contribution } from "./registry";
import type { ActionSource, VimApi } from "../types";

/**
 * Everything a feature module may depend on.
 *
 * Modules take what they need from here instead of reaching into the plugin.
 * A service that several modules share (the structure service, the jumplist)
 * is added to this object once, and every module sees it.
 */
export interface ModuleContext {
	app: App;
	getVim: () => VimApi | null;
}

/** What one module hands back: data for the registry, and optionally a lifecycle. */
export interface ModuleInstance {
	/** Actions and default bindings. Applied and removed as a unit. */
	contribution?: Contribution;
	/**
	 * For modules that watch the workspace, add editor extensions or touch the
	 * DOM. Loaded as a child when the module starts and unloaded with it, so
	 * everything it registers is cleaned up by Obsidian's own ordering.
	 */
	component?: Component;
}

/**
 * The unit every feature is built as.
 *
 * One module is one file under `src/modules/`, registered once in
 * `src/modules/index.ts`. `main.ts` never changes when a module is added.
 */
export interface FeatureModule {
	/** Kebab-case and unique. Becomes the registry source `module:<id>`. */
	id: string;
	/** One line, shown in the module contract test's failures. */
	title: string;
	/**
	 * Builds the instance. Must not touch the editor or the Vim API: both may
	 * not exist yet, and the call happens once at startup.
	 */
	create(ctx: ModuleContext): ModuleInstance;
}

export function moduleSource(id: string): ActionSource {
	return `module:${id}`;
}

export interface ModuleHostOptions {
	registry: ActionRegistry;
	modules: readonly FeatureModule[];
	context: ModuleContext;
	/** Called when one module fails to start, so the rest still do. */
	onError?: (module: FeatureModule, error: unknown) => void;
}

/**
 * Starts every feature module and hands their contributions to the registry in
 * one batch, in declaration order, so "later wins" is stable.
 */
export class ModuleHost extends Component {
	private started: FeatureModule[] = [];

	constructor(private readonly options: ModuleHostOptions) {
		super();
	}

	override onload(): void {
		const { registry, modules, context, onError } = this.options;
		registry.batch(() => {
			for (const module of modules) {
				try {
					const instance = module.create(context);
					if (instance.component) {
						this.addChild(instance.component);
					}
					registry.set(moduleSource(module.id), instance.contribution ?? {});
					this.started.push(module);
				} catch (error) {
					onError?.(module, error);
				}
			}
		});
	}

	override onunload(): void {
		const { registry } = this.options;
		registry.batch(() => {
			for (const module of this.started) {
				registry.remove(moduleSource(module.id));
			}
		});
		this.started = [];
	}

	/** Ids of the modules that started. */
	get active(): string[] {
		return this.started.map((module) => module.id);
	}
}
