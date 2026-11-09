import { Component, Notice, normalizePath } from "obsidian";
import type { App, DataAdapter } from "obsidian";

import { createScriptApi } from "./api";
import { TYPINGS, TYPINGS_FILENAME } from "./typings";
import { validateContribution } from "../core/validate";
import type { ActionRegistry, Contribution } from "../core/registry";
import type { ActionSource, VimApi } from "../types";

/** `init.js` runs first; the rest follow in lexical order, like Neovim's plugin/. */
const ENTRY_POINT = "init.js";

export interface ScriptError {
	file: string;
	message: string;
	/** 1-based line within the script, when it can be recovered. */
	line?: number;
}

export interface ScriptLoadResult {
	loaded: string[];
	errors: ScriptError[];
}

export interface ScriptHostOptions {
	app: App;
	registry: ActionRegistry;
	getVim: () => VimApi | null;
	isEnabled: () => boolean;
	getFolder: () => string;
	getLeader: () => string;
}

/**
 * Loads and re-loads the user's JavaScript configuration.
 *
 * Scripts are arbitrary code from the vault, so this is opt-in and the risk is
 * stated plainly in settings: a synced vault runs the same file on every
 * device. See SECURITY.md.
 *
 * Every script produces a contribution, and the whole set is handed to the
 * registry in one batch at the end. That makes a reload atomic: either the new
 * configuration replaces the old one entirely, or a script failed and its
 * contribution is simply never applied.
 *
 * Scripts live under the vault's config directory, which is deliberately
 * outside the file index, so they are read through the adapter rather than the
 * Vault API.
 */
export class ScriptHost extends Component {
	private lastResult: ScriptLoadResult = { loaded: [], errors: [] };
	private appliedSources: ActionSource[] = [];
	private reloadTimer: number | null = null;
	private running: Promise<ScriptLoadResult> | null = null;
	private rerun = false;

	constructor(private readonly options: ScriptHostOptions) {
		super();
	}

	override onload(): void {
		this.options.app.workspace.onLayoutReady(() => void this.reload());
		this.watchFolder();
	}

	override onunload(): void {
		this.options.registry.batch(() => this.removeApplied());
	}

	get result(): ScriptLoadResult {
		return this.lastResult;
	}

	get folder(): string {
		return normalizePath(this.options.getFolder());
	}

	private get adapter(): DataAdapter {
		return this.options.app.vault.adapter;
	}

	/**
	 * Runs every script and replaces the previous configuration with the result.
	 *
	 * Reading and running scripts is asynchronous, so two reloads can overlap: a
	 * save during a slow read, or a settings change landing with a file
	 * change. If both ran at once the one that finished last would win, which
	 * can be the one that read the older file. So only one runs at a time, and
	 * a call made while one is running asks for exactly one more run after it
	 * - however many calls pile up - and every caller gets that final result.
	 */
	reload(): Promise<ScriptLoadResult> {
		if (this.running) {
			this.rerun = true;
			return this.running;
		}
		const run = (async () => {
			try {
				let result: ScriptLoadResult;
				do {
					this.rerun = false;
					result = await this.runReload();
				} while (this.rerun);
				return result;
			} finally {
				this.running = null;
			}
		})();
		this.running = run;
		return run;
	}

	private async runReload(): Promise<ScriptLoadResult> {
		const enabled = this.options.isEnabled();
		const files = enabled ? await this.listScripts() : [];
		if (enabled) {
			await this.syncTypings();
		}
		const loaded: string[] = [];
		const errors: ScriptError[] = [];
		const applied: [ActionSource, Contribution][] = [];

		// Ids defined earlier in this same reload, so a later script can map to
		// an action an earlier one declared even though nothing is applied yet.
		const pending = new Set<string>();

		for (const file of files) {
			const outcome = await this.runScript(file, pending);
			if ("error" in outcome) {
				errors.push(outcome.error);
				continue;
			}
			loaded.push(file);
			applied.push([sourceOf(file), outcome.contribution]);
			for (const action of outcome.contribution.actions ?? []) {
				pending.add(action.id);
			}
		}

		this.options.registry.batch(() => {
			this.removeApplied();
			for (const [source, contribution] of applied) {
				this.options.registry.set(source, contribution);
			}
			this.appliedSources = applied.map(([source]) => source);
		});

		this.lastResult = { loaded, errors };
		this.reportErrors(errors);
		return this.lastResult;
	}

	private removeApplied(): void {
		for (const source of this.appliedSources) {
			this.options.registry.remove(source);
		}
		this.appliedSources = [];
	}

	/**
	 * Keeps `vim-tools.d.ts` in step with the plugin.
	 *
	 * It describes the `vim` object, which changes with each release, and the
	 * file is only otherwise written by the "Create scripts folder" command,
	 * so an editor would go on autocompleting last year's API. It belongs to
	 * the plugin, and its header says it is rewritten, so it is rewritten when it
	 * differs. Only where a scripts folder already exists, and never at the
	 * cost of loading the scripts: it is a convenience.
	 */
	private async syncTypings(): Promise<void> {
		try {
			if (!(await this.adapter.exists(this.folder))) {
				return;
			}
			const path = normalizePath(`${this.folder}/${TYPINGS_FILENAME}`);
			const current = (await this.adapter.exists(path)) ? await this.adapter.read(path) : null;
			if (current !== TYPINGS) {
				await this.adapter.write(path, TYPINGS);
			}
		} catch {
			// Read-only folder, or a sync client holding the file.
		}
	}

	private async listScripts(): Promise<string[]> {
		const folder = this.folder;
		if (!(await this.adapter.exists(folder))) {
			return [];
		}
		const listing = await this.adapter.list(folder);
		const names = listing.files
			.map((path) => path.slice(path.lastIndexOf("/") + 1))
			.filter((name) => name.endsWith(".js"))
			.sort((a, b) => a.localeCompare(b));

		return [
			...names.filter((name) => name === ENTRY_POINT),
			...names.filter((name) => name !== ENTRY_POINT),
		];
	}

	private async runScript(
		file: string,
		pending: Set<string>,
	): Promise<{ contribution: Contribution } | { error: ScriptError }> {
		let code: string;
		try {
			code = await this.adapter.read(normalizePath(`${this.folder}/${file}`));
		} catch (error) {
			return { error: { file, message: describe(error) } };
		}

		const { registry } = this.options;
		const { api, contribution } = createScriptApi({
			app: this.options.app,
			getVim: this.options.getVim,
			leader: this.options.getLeader(),
			knowsAction: (id) => pending.has(id) || registry.has(id),
		});

		try {
			// Async so scripts may `await`. Not a sandbox — see SECURITY.md.
			const run = new AsyncFunction("vim", wrap(code));
			await run(api);
		} catch (error) {
			return {
				error: { file, message: describe(error), line: await scriptLine(error) },
			};
		}

		const problems = validateContribution(contribution);
		if (problems.length > 0) {
			return { error: { file, message: problems.join("\n") } };
		}

		return { contribution };
	}

	private reportErrors(errors: ScriptError[]): void {
		for (const error of errors) {
			const where = error.line ? `${error.file}:${error.line}` : error.file;
			new Notice(`Vim Tools — ${where}\n${error.message}`, 10000);
		}
	}

	/** Re-runs everything when any file in the scripts folder changes. */
	private watchFolder(): void {
		const maybeReload = (path: string): void => {
			// With the separator, so a sibling folder such as `vim-tools-old` is not ours.
			if (!path.startsWith(`${this.folder}/`) || !path.endsWith(".js")) {
				return;
			}
			// Editors often write in bursts; collapse them into one reload.
			if (this.reloadTimer !== null) {
				window.clearTimeout(this.reloadTimer);
			}
			this.reloadTimer = window.setTimeout(() => {
				this.reloadTimer = null;
				void this.reload();
			}, 150);
		};

		const { vault } = this.options.app;
		this.registerEvent(vault.on("modify", (file) => maybeReload(file.path)));
		this.registerEvent(vault.on("create", (file) => maybeReload(file.path)));
		this.registerEvent(vault.on("delete", (file) => maybeReload(file.path)));
		this.registerEvent(
			vault.on("rename", (file, oldPath) => {
				maybeReload(file.path);
				maybeReload(oldPath);
			}),
		);
		this.register(() => {
			if (this.reloadTimer !== null) {
				window.clearTimeout(this.reloadTimer);
			}
		});
	}
}

export function sourceOf(file: string): ActionSource {
	return `script:${file}`;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type ScriptFactory = new (...args: string[]) => (vim: unknown) => Promise<void>;

/**
 * The `AsyncFunction` constructor, which is not a global binding and has to be
 * reached through an async function's prototype.
 */
const AsyncFunction: ScriptFactory = Object.getPrototypeOf(
	async function () {
		/* only ever used to reach its constructor */
	},
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Object.getPrototypeOf returns any; the cast constrains it
).constructor as ScriptFactory;

function wrap(code: string): string {
	return `"use strict";\n${code}`;
}

/**
 * How many lines the engine's function wrapper adds before the script's own
 * first line.
 *
 * Hardcoding this is unreliable: V8 splits the generated header across two
 * lines, `wrap` adds the strict directive, and the frame is attributed to the
 * calling file rather than `<anonymous>` under some hosts. So it is measured
 * once by throwing from a known position instead of assumed.
 */
let bodyOffset: number | null = null;

async function calibrate(): Promise<number> {
	if (bodyOffset !== null) {
		return bodyOffset;
	}
	bodyOffset = 0;
	try {
		await new AsyncFunction("vim", wrap(`throw new Error("calibration");`))(null);
	} catch (error) {
		const reported = firstFrameLine(error);
		if (reported !== undefined) {
			// The throw above is the script's line 1.
			bodyOffset = reported - 1;
		}
	}
	return bodyOffset;
}

/** The 1-based line within the user's script, when it can be recovered. */
async function scriptLine(error: unknown): Promise<number | undefined> {
	const reported = firstFrameLine(error);
	if (reported === undefined) {
		return undefined;
	}
	const line = reported - (await calibrate());
	return line > 0 ? line : undefined;
}

function firstFrameLine(error: unknown): number | undefined {
	if (!(error instanceof Error) || !error.stack) {
		return undefined;
	}
	// Skip the message line; the first frame is where the throw happened.
	const [, ...frames] = error.stack.split("\n");
	for (const frame of frames) {
		const match = /:(\d+):\d+\)?\s*$/.exec(frame);
		if (match?.[1]) {
			return Number.parseInt(match[1], 10);
		}
	}
	return undefined;
}
