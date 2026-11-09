import { Notice } from "obsidian";
import type { App } from "obsidian";

import type { BindingSpec, Contribution } from "../core/registry";
import type {
	BindingContext,
	VimActionArgs,
	VimActionDef,
	VimActionResult,
	VimApi,
	VimContext,
} from "../types";

export type ScriptRun = (
	ctx: VimContext,
	args: VimActionArgs,
) => VimActionResult | Promise<VimActionResult>;

export interface DefineOptions {
	name?: string;
	group?: string;
	/** Also register an Obsidian command (and so a hotkey slot). Default true. */
	command?: boolean;
	needsEditor?: boolean;
	resultMode?: "insert" | "normal";
}

/** The `vim` object handed to every script. */
export interface ScriptApi {
	readonly app: App;

	action(id: string, run: ScriptRun, options?: DefineOptions): void;
	motion(id: string, run: ScriptRun, options?: DefineOptions): void;
	operator(id: string, run: ScriptRun, options?: DefineOptions): void;

	/** Recursive maps, as in vim's `nmap` family. */
	map(keys: string, rhs: string, contexts?: BindingContext[]): void;
	nmap(keys: string, rhs: string): void;
	vmap(keys: string, rhs: string): void;
	imap(keys: string, rhs: string): void;
	omap(keys: string, rhs: string): void;

	/** Non-recursive maps, as in vim's `nnoremap` family. */
	noremap(keys: string, rhs: string, contexts?: BindingContext[]): void;
	nnoremap(keys: string, rhs: string): void;
	vnoremap(keys: string, rhs: string): void;
	inoremap(keys: string, rhs: string): void;
	onoremap(keys: string, rhs: string): void;

	/** Binds a key straight to an action id, skipping id-vs-keys guessing. */
	bind(keys: string, actionId: string, contexts?: BindingContext[]): void;

	/** Sets the `<leader>` prefix used by every subsequent mapping. */
	leader(key: string): void;

	/** Sets a vim option, e.g. `set("textwidth", 80)`. */
	set(option: string, value: unknown): void;

	/** Runs an Obsidian command by id. */
	obcommand(id: string): boolean;

	notice(message: string, timeout?: number): void;
}

export interface ScriptApiDeps {
	app: App;
	getVim: () => VimApi | null;
	/** Leader in force when the script starts; a script may change its own. */
	leader: string;
	/** True when the id names an action some earlier source already defined. */
	knowsAction: (id: string) => boolean;
	/**
	 * What kind of action that is. Without it a known id is taken to be a plain
	 * action, which is wrong for a motion or an operator: bound as an action it
	 * would not move the cursor or compose with `d`.
	 */
	kindOf?: (id: string) => VimActionDef["kind"] | undefined;
}

const ALL_CONTEXTS: BindingContext[] = ["normal", "visual", "insert", "operatorPending"];

/**
 * Builds the `vim` object for one script, collecting everything it declares
 * into a single contribution.
 *
 * Nothing is applied as the script runs. The script either completes and its
 * whole contribution is handed to the registry, or it throws and the partial
 * contribution is discarded — so a failing script can never leave half its
 * configuration in effect.
 */
export function createScriptApi(deps: ScriptApiDeps): {
	api: ScriptApi;
	contribution: Contribution;
} {
	const actions: VimActionDef[] = [];
	const bindings: BindingSpec[] = [];
	let leader = deps.leader;

	const defined = new Map<string, VimActionDef["kind"]>();

	const define = (
		kind: VimActionDef["kind"],
		id: string,
		run: ScriptRun,
		options: DefineOptions = {},
	): void => {
		if (!id) {
			throw new Error("An action needs an id");
		}
		actions.push({
			id,
			name: options.name ?? id,
			group: options.group ?? "Scripts",
			kind,
			command: options.command,
			needsEditor: options.needsEditor,
			resultMode: options.resultMode,
			run,
		});
		defined.set(id, kind);
	};

	/** An id this script defined, or one an earlier source already did. */
	const actionKindOf = (id: string): VimActionDef["kind"] | undefined =>
		defined.get(id) ?? deps.kindOf?.(id) ?? (deps.knowsAction(id) ? "action" : undefined);

	const addMap = (
		keys: string,
		rhs: string,
		contexts: BindingContext[],
		recursive: boolean,
	): void => {
		// A right-hand side naming a known action binds to it; anything else is
		// handed to vim as an ordinary remap. That keeps both
		// `nmap("<leader>d", "myAction")` and `nmap("H", "^")` doing the
		// obvious thing.
		const kind = actionKindOf(rhs);
		bindings.push({
			keys: expandLeader(keys, leader),
			contexts,
			target: kind
				? { kind: "action", id: rhs, actionKind: kind }
				: { kind: "keys", rhs: expandLeader(rhs, leader), recursive },
		});
	};

	const api: ScriptApi = {
		app: deps.app,

		action: (id, run, options) => define("action", id, run, options),
		motion: (id, run, options) => define("motion", id, run, options),
		operator: (id, run, options) => define("operator", id, run, options),

		map: (keys, rhs, contexts = ALL_CONTEXTS) => addMap(keys, rhs, contexts, true),
		nmap: (keys, rhs) => addMap(keys, rhs, ["normal"], true),
		vmap: (keys, rhs) => addMap(keys, rhs, ["visual"], true),
		imap: (keys, rhs) => addMap(keys, rhs, ["insert"], true),
		omap: (keys, rhs) => addMap(keys, rhs, ["operatorPending"], true),

		noremap: (keys, rhs, contexts = ALL_CONTEXTS) => addMap(keys, rhs, contexts, false),
		nnoremap: (keys, rhs) => addMap(keys, rhs, ["normal"], false),
		vnoremap: (keys, rhs) => addMap(keys, rhs, ["visual"], false),
		inoremap: (keys, rhs) => addMap(keys, rhs, ["insert"], false),
		onoremap: (keys, rhs) => addMap(keys, rhs, ["operatorPending"], false),

		bind: (keys, actionId, contexts = ["normal"]) => {
			bindings.push({
				keys: expandLeader(keys, leader),
				contexts,
				target: {
					kind: "action",
					id: actionId,
					actionKind: actionKindOf(actionId) ?? "action",
				},
			});
		},

		leader: (key) => {
			leader = key;
		},

		set: (option, value) => {
			const vim = deps.getVim();
			if (!vim) {
				throw new Error(`Cannot set "${option}": vim mode is not active`);
			}
			vim.setOption(option, value);
		},

		obcommand: (id) => {
			const commands = (
				deps.app as unknown as {
					commands: { executeCommandById(id: string): boolean };
				}
			).commands;
			const ran = commands.executeCommandById(id);
			if (!ran) {
				throw new Error(`Obsidian command "${id}" was not found or could not run`);
			}
			return ran;
		},

		notice: (message, timeout) => {
			new Notice(message, timeout);
		},
	};

	return { api, contribution: { actions, bindings } };
}

/** Replaces `<leader>` with the configured prefix, as vim does at map time. */
export function expandLeader(keys: string, leader: string): string {
	return keys.replace(/<leader>/gi, leader);
}
