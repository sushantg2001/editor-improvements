import { Notice } from "obsidian";
import type { App } from "obsidian";

import type { BindingSpec, Contribution, UnmapSpec } from "../core/registry";
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
	/**
	 * Also register an Obsidian command (and so a hotkey slot). Default true,
	 * except for operators, which need a motion and so default to false.
	 */
	command?: boolean;
	needsEditor?: boolean;
	resultMode?: "insert" | "normal";
	/** The action changes the document, so `.` repeats it. */
	isEdit?: boolean;
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

	/**
	 * Removes vim's built-in binding for `keys`. That is what lets a key that
	 * means something already, like `S` or `,`, be the start of a longer
	 * mapping such as `Sl`.
	 *
	 * Unlike a mapping, this is not undone when a script is edited or the
	 * plugin is turned off: the built-in stays gone until Obsidian restarts.
	 */
	unmap(keys: string, contexts?: BindingContext[]): void;
	nunmap(keys: string): void;
	vunmap(keys: string): void;
	iunmap(keys: string): void;
	ounmap(keys: string): void;

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
	const unmaps: UnmapSpec[] = [];
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
			// An operator acts on a range a motion gives it, and the palette has no
			// motion to give one, so it is not a command unless the script says so.
			command: options.command ?? (kind === "operator" ? false : undefined),
			needsEditor: options.needsEditor,
			resultMode: options.resultMode,
			isEdit: options.isEdit,
			run,
		});
		defined.set(id, kind);
	};

	/** An id this script defined, or one an earlier source already did. */
	const actionKindOf = (id: string): VimActionDef["kind"] | undefined =>
		defined.get(id) ?? (deps.knowsAction(id) ? "action" : undefined);

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

		unmap: (keys, contexts) => {
			unmaps.push({ keys: expandLeader(keys, leader), contexts });
		},
		nunmap: (keys) => api.unmap(keys, ["normal"]),
		vunmap: (keys) => api.unmap(keys, ["visual"]),
		iunmap: (keys) => api.unmap(keys, ["insert"]),
		ounmap: (keys) => api.unmap(keys, ["operatorPending"]),

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

	return { api, contribution: { actions, bindings, unmaps } };
}

/** Replaces `<leader>` with the configured prefix, as vim does at map time. */
export function expandLeader(keys: string, leader: string): string {
	return keys.replace(/<leader>/gi, leader);
}
