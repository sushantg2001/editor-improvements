import type { ActionDef, ActionRegistry, ActionResult, RunContext } from "../actions/registry";
import { activeEditorView, commandsOf } from "../actions/registry";
import type { Engine, EngineGeneration, MapMode } from "../engine/engine";
import { type KeySeq, keysToString, NotationError, parseKeys, parseRhs, type Rhs } from "../notation/parse";
import type { RouterMapping } from "../router/router";
import type { App } from "obsidian";
import { PRELUDE } from "./prelude";
import { lauxlib, lua, to_luastring } from "./runtime/index";
import { CALL_LIMIT, guardedCall, js, LOAD_LIMIT, loadChunk, type LuaState, newState, raise } from "./vm";

export interface ConfigHost {
	app: App;
	engine: Engine;
	actions: Pick<ActionRegistry, "get" | "run" | "validate">;
	platform: { desktop: boolean; mobile: boolean; os: string; version: string };
	notify(message: string, level: number): void;
}

/** What one successful config load produced. */
export interface CompiledConfig {
	mappings: RouterMapping[];
	engine: EngineGeneration;
	timeoutlen: number;
	strictkeys: boolean;
	luaActions: ActionDef[];
	/** Problems that do not stop the config from loading. */
	warnings: string[];
}

export type ConfigResult = { ok: true; config: CompiledConfig } | { ok: false; error: string };

const MODE_EXPANSION: Record<string, MapMode[]> = { "": ["n", "v", "o"], n: ["n"], i: ["i"], v: ["v"], x: ["x"], o: ["o"] };
const KEYMAP_OPTIONS = new Set(["remap", "desc", "silent"]);
const ROUTER_OPTIONS = new Set(["desc", "repeatable"]);
const CONTEXT = /^(?:editor(?::[nivxoRc])?|input|transient|modal|global|view:[\w-]+)$/;

let nextLuaId = 0;

const routerContext = (mode: MapMode): string => (mode === "x" ? "editor:v" : `editor:${mode}`);

class ConfigRun {
	readonly mappings: RouterMapping[] = [];
	readonly maps: EngineGeneration["maps"] = [];
	readonly options = new Map<string, unknown>();
	readonly commands: string[] = [];
	readonly luaActions: ActionDef[] = [];
	readonly warnings = new Set<string>();
	timeoutlen = 1000;
	strictkeys = true;
	loading = true;
	private current: RunContext | null = null;

	constructor(readonly L: LuaState, readonly files: Map<string, string>, readonly host: ConfigHost) {}

	private text(index: number): string {
		return js(lauxlib.luaL_checkstring(this.L, index));
	}

	private stringList(index: number, what: string): string[] {
		const { L } = this;
		if (lua.lua_type(L, index) === lua.LUA_TSTRING) return [this.text(index)];
		if (lua.lua_type(L, index) !== lua.LUA_TTABLE) raise(L, `${what} must be a string or a list of strings`);
		const items: string[] = [];
		const length = lua.lua_rawlen(L, index);
		for (let i = 1; i <= length; i++) {
			lua.lua_rawgeti(L, index, i);
			if (lua.lua_type(L, -1) !== lua.LUA_TSTRING) raise(L, `${what} must be a list of strings`);
			items.push(js(lua.lua_tostring(L, -1)));
			lua.lua_pop(L, 1);
		}
		return items;
	}

	private leader(): string {
		const { L } = this;
		lua.lua_getglobal(L, to_luastring("vim"));
		lua.lua_getfield(L, -1, to_luastring("g"));
		lua.lua_getfield(L, -1, to_luastring("mapleader"));
		const leader = lua.lua_type(L, -1) === lua.LUA_TSTRING ? js(lua.lua_tostring(L, -1)) : "\\";
		lua.lua_pop(L, 3);
		return leader;
	}

	private readonly unknownName = (token: string): void => {
		this.warnings.add(`Unknown key ${token} is read as text. Write <lt>${token.slice(1)} if the text is meant.`);
	};

	private parse<T>(read: () => T): T {
		try {
			return read();
		} catch (error) {
			if (error instanceof NotationError) raise(this.L, error.message);
			throw error;
		}
	}

	private keys(text: string): KeySeq {
		const keys = this.parse(() => parseKeys(text, this.leader(), this.unknownName));
		if (keys.length === 0) raise(this.L, "keys must not be empty");
		return keys;
	}

	/** Reads a right-hand side. `<Nop>` and `<Ignore>` may leave it empty, but the text itself may not be. */
	private rhs(text: string): Rhs {
		if (text === "") raise(this.L, 'rhs must not be empty. Use "<Nop>" for a key that does nothing.');
		return this.parse(() => parseRhs(text, this.leader(), this.unknownName));
	}

	/** Reads an options table, refusing any option that is not supported. */
	private opts(index: number, allowed: Set<string>): { desc?: string; remap: boolean; repeatable?: boolean } {
		const { L } = this;
		const result: { desc?: string; remap: boolean; repeatable?: boolean } = { remap: false };
		if (lua.lua_isnoneornil(L, index)) return result;
		if (lua.lua_type(L, index) !== lua.LUA_TTABLE) raise(L, "opts must be a table");
		lua.lua_pushnil(L);
		while (lua.lua_next(L, index) !== 0) {
			const name = lua.lua_type(L, -2) === lua.LUA_TSTRING ? js(lua.lua_tostring(L, -2)) : "?";
			if (!allowed.has(name)) raise(L, `Unsupported option: ${name}`);
			if (name === "desc") result.desc = js(lauxlib.luaL_tolstring(L, -1));
			if (name === "desc") lua.lua_pop(L, 1);
			if (name === "remap") result.remap = lua.lua_toboolean(L, -1);
			if (name === "repeatable") result.repeatable = lua.lua_toboolean(L, -1);
			lua.lua_pop(L, 1);
		}
		return result;
	}

	private addFunction(index: number, desc: string | undefined): string {
		const { L } = this;
		lua.lua_pushvalue(L, index);
		const ref: number = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
		const id = `lua:${++nextLuaId}`;
		this.luaActions.push({ id, title: desc ?? "Lua function", repeatable: false, run: (context) => this.callFunction(ref, context) });
		return id;
	}

	private callFunction(ref: number, context: RunContext): ActionResult {
		const { L } = this;
		const previous = this.current;
		this.current = context;
		lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
		lua.lua_createtable(L, 0, 4);
		const field = (name: string, value: string | undefined): void => {
			if (value === undefined) return;
			lua.lua_pushstring(L, to_luastring(value));
			lua.lua_setfield(L, -2, to_luastring(name));
		};
		field("context", context.classified?.context);
		field("mode", context.classified?.mode);
		field("key", context.key);
		field("path", this.host.app.workspace.getActiveFile()?.path);
		const error = guardedCall(L, 1, 1, CALL_LIMIT);
		this.current = previous;
		if (error) throw new Error(error);
		const declined = lua.lua_isboolean(L, -1) && !lua.lua_toboolean(L, -1);
		lua.lua_pop(L, 1);
		return declined ? "not-applicable" : "handled";
	}

	private removeMapping(mode: MapMode, lhs: KeySeq): boolean {
		const text = keysToString(lhs);
		let removed = false;
		for (let i = this.maps.length - 1; i >= 0; i--) {
			const map = this.maps[i];
			if (map && map.mode === mode && keysToString(map.lhs) === text) {
				this.maps.splice(i, 1);
				removed = true;
			}
		}
		return this.removeRouter(routerContext(mode), lhs) || removed;
	}

	private removeRouter(context: string, lhs: KeySeq): boolean {
		const text = keysToString(lhs);
		const at = this.mappings.findIndex((mapping) => mapping.context === context && keysToString(mapping.keys) === text);
		if (at < 0) return false;
		this.mappings.splice(at, 1);
		return true;
	}

	private modes(index: number): MapMode[] {
		return this.stringList(index, "mode").flatMap((mode) => {
			const modes = MODE_EXPANSION[mode];
			if (!modes) raise(this.L, `Unsupported mode: "${mode}"`);
			return modes;
		});
	}

	private readonly keymapSet = (L: LuaState): number => {
		const modes = this.modes(1);
		const lhs = this.keys(this.text(2));
		const opts = this.opts(4, KEYMAP_OPTIONS);
		const type = lua.lua_type(L, 3);
		if (type !== lua.LUA_TSTRING && type !== lua.LUA_TFUNCTION) raise(L, "rhs must be keys or a function");
		const rhs = type === lua.LUA_TSTRING ? this.rhs(this.text(3)) : null;
		const action = rhs ? null : this.addFunction(3, opts.desc);
		for (const mode of modes) {
			this.removeMapping(mode, lhs);
			if (rhs) this.maps.push({ mode, lhs, rhs, noremap: !opts.remap });
			else if (action) this.mappings.push({ context: routerContext(mode), keys: lhs, action, repeatable: false, ...(opts.desc ? { desc: opts.desc } : {}) });
		}
		return 0;
	};

	private readonly keymapDel = (L: LuaState): number => {
		const modes = this.modes(1);
		const lhs = this.keys(this.text(2));
		if (!lua.lua_isnoneornil(L, 3)) raise(L, "vim.keymap.del takes no options");
		let removed = false;
		for (const mode of modes) removed = this.removeMapping(mode, lhs) || removed;
		if (!removed) raise(L, `No mapping for ${keysToString(lhs)}`);
		return 0;
	};

	private contexts(index: number): string[] {
		const contexts = this.stringList(index, "context");
		for (const context of contexts) {
			if (!CONTEXT.test(context)) raise(this.L, `Unknown context: "${context}"`);
		}
		return contexts;
	}

	private readonly obsidianSet = (L: LuaState): number => {
		const contexts = this.contexts(1);
		const lhs = this.keys(this.text(2));
		const opts = this.opts(4, ROUTER_OPTIONS);
		const type = lua.lua_type(L, 3);
		let action: string;
		if (type === lua.LUA_TSTRING) {
			action = this.text(3);
			if (!/^(?:keys|ex|obsidian|native|plugin):./.test(action)) raise(L, `Unknown action: "${action}"`);
			if (action.startsWith("keys:")) this.rhs(action.slice("keys:".length));
		} else if (type === lua.LUA_TFUNCTION) {
			action = this.addFunction(3, opts.desc);
		} else {
			raise(L, "rhs must be an action id or a function");
		}
		const repeatable = opts.repeatable ?? (action.startsWith("keys:") || action.startsWith("native:"));
		for (const context of contexts) {
			this.removeRouter(context, lhs);
			this.mappings.push({ context, keys: lhs, action, repeatable, ...(opts.desc ? { desc: opts.desc } : {}) });
		}
		return 0;
	};

	private readonly obsidianDel = (L: LuaState): number => {
		const lhs = this.keys(this.text(2));
		let removed = false;
		for (const context of this.contexts(1)) removed = this.removeRouter(context, lhs) || removed;
		if (!removed) raise(L, `No mapping for ${keysToString(lhs)}`);
		return 0;
	};

	private readonly getOption = (L: LuaState): number => {
		const name = this.text(2);
		if (name === "timeoutlen") lua.lua_pushinteger(L, this.timeoutlen);
		else if (name === "strictkeys") lua.lua_pushboolean(L, this.strictkeys);
		else if (this.host.engine.isOption(name)) this.pushValue(this.options.has(name) ? this.options.get(name) : this.host.engine.getOption(name));
		else raise(L, `Unknown option: ${name}`);
		return 1;
	};

	private pushValue(value: unknown): void {
		const { L } = this;
		if (typeof value === "boolean") lua.lua_pushboolean(L, value);
		else if (typeof value === "number") lua.lua_pushnumber(L, value);
		else if (typeof value === "string") lua.lua_pushstring(L, to_luastring(value));
		else lua.lua_pushnil(L);
	}

	private readonly setOption = (L: LuaState): number => {
		const name = this.text(2);
		const type = lua.lua_type(L, 3);
		if (name === "timeoutlen") {
			if (type !== lua.LUA_TNUMBER || lua.lua_tonumber(L, 3) < 0) raise(L, "timeoutlen must be a number of milliseconds");
			this.timeoutlen = lua.lua_tonumber(L, 3);
		} else if (name === "strictkeys") {
			if (type !== lua.LUA_TBOOLEAN) raise(L, "strictkeys must be a boolean");
			this.strictkeys = lua.lua_toboolean(L, 3);
		} else if (this.host.engine.isOption(name)) {
			let value: unknown;
			if (type === lua.LUA_TBOOLEAN) value = lua.lua_toboolean(L, 3);
			else if (type === lua.LUA_TNUMBER) value = lua.lua_tonumber(L, 3);
			else if (type === lua.LUA_TSTRING) value = js(lua.lua_tostring(L, 3));
			else raise(L, `Invalid value for ${name}`);
			this.options.set(name, value);
		} else {
			raise(L, `Unknown option: ${name}`);
		}
		return 0;
	};

	private readonly cmd = (L: LuaState): number => {
		for (const line of this.text(1).split("\n").map((part) => part.trim()).filter(Boolean)) {
			if (this.loading) {
				this.commands.push(line);
			} else {
				const error = this.host.engine.runEx(activeEditorView(this.host.app), line);
				if (error) raise(L, error);
			}
		}
		return 0;
	};

	private readonly notify = (L: LuaState): number => {
		const message = js(lauxlib.luaL_tolstring(L, 1));
		lua.lua_pop(L, 1);
		this.host.notify(message, lua.lua_isnumber(L, 2) ? lua.lua_tonumber(L, 2) : 2);
		return 0;
	};

	private readonly command = (L: LuaState): number => {
		const id = this.text(1);
		const commands = commandsOf(this.host.app);
		if (!commands.findCommand(id)) raise(L, `Unknown command: ${id}`);
		lua.lua_pushboolean(L, commands.executeCommandById(id));
		return 1;
	};

	private readonly listCommands = (L: LuaState): number => {
		const commands = commandsOf(this.host.app).listCommands();
		lua.lua_createtable(L, commands.length, 0);
		commands.forEach((command, i) => {
			lua.lua_createtable(L, 0, 2);
			lua.lua_pushstring(L, to_luastring(command.id));
			lua.lua_setfield(L, -2, to_luastring("id"));
			lua.lua_pushstring(L, to_luastring(command.name));
			lua.lua_setfield(L, -2, to_luastring("name"));
			lua.lua_rawseti(L, -2, i + 1);
		});
		return 1;
	};

	private runAction(id: string): ActionResult {
		return this.host.actions.run(id, this.current ?? { classified: null, event: null });
	}

	private readonly action = (L: LuaState): number => {
		lua.lua_pushstring(L, to_luastring(this.runAction(this.text(1))));
		return 1;
	};

	private readonly run = (L: LuaState): number => {
		const id = this.text(1);
		const [problem] = this.host.actions.validate([id]);
		if (problem) raise(L, `Unknown action: ${id}`);
		lua.lua_pushcfunction(L, (state: LuaState) => {
			if (this.runAction(id) !== "not-applicable") return 0;
			lua.lua_pushboolean(state, false);
			return 1;
		});
		return 1;
	};

	private readonly loadModule = (L: LuaState): number => {
		const name = this.text(1);
		const base = `lua/${name.replaceAll(".", "/")}`;
		const file = [`${base}.lua`, `${base}/init.lua`].find((path) => this.files.has(path));
		if (!file) raise(L, `module '${name}' not found`);
		const error = loadChunk(L, this.files.get(file) ?? "", file);
		if (error) raise(L, error);
		return 1;
	};

	private pushHost(): void {
		const { L } = this;
		const functions: Record<string, (state: LuaState) => number> = {
			keymap_set: this.keymapSet, keymap_del: this.keymapDel, obsidian_set: this.obsidianSet, obsidian_del: this.obsidianDel,
			get_option: this.getOption, set_option: this.setOption, cmd: this.cmd, notify: this.notify, command: this.command,
			commands: this.listCommands, action: this.action, run: this.run, load_module: this.loadModule,
		};
		lua.lua_createtable(L, 0, 14);
		for (const [name, fn] of Object.entries(functions)) {
			lua.lua_pushcfunction(L, fn);
			lua.lua_setfield(L, -2, to_luastring(name));
		}
		const { platform } = this.host;
		lua.lua_createtable(L, 0, 5);
		lua.lua_pushboolean(L, platform.desktop);
		lua.lua_setfield(L, -2, to_luastring("desktop"));
		lua.lua_pushboolean(L, platform.mobile);
		lua.lua_setfield(L, -2, to_luastring("mobile"));
		lua.lua_pushboolean(L, false);
		lua.lua_setfield(L, -2, to_luastring("neovim"));
		lua.lua_pushstring(L, to_luastring(platform.os));
		lua.lua_setfield(L, -2, to_luastring("os"));
		lua.lua_pushstring(L, to_luastring(platform.version));
		lua.lua_setfield(L, -2, to_luastring("version"));
		lua.lua_setfield(L, -2, to_luastring("platform"));
	}

	execute(): string | null {
		const { L } = this;
		const preludeError = loadChunk(L, PRELUDE, "prelude") ?? (this.pushHost(), guardedCall(L, 1, 0, LOAD_LIMIT));
		if (preludeError) return preludeError;
		const source = this.files.get("init.lua");
		if (source === undefined) return "init.lua does not exist";
		const error = loadChunk(L, source, "init.lua") ?? guardedCall(L, 0, 0, LOAD_LIMIT);
		this.loading = false;
		return error;
	}
}

/** Runs a config in a fresh Lua state. Nothing is applied until the caller swaps it in. */
export function runConfig(files: Map<string, string>, host: ConfigHost): ConfigResult {
	const run = new ConfigRun(newState(), files, host);
	const error = run.execute();
	if (error) return { ok: false, error };
	return {
		ok: true,
		config: {
			mappings: run.mappings,
			engine: { maps: run.maps, options: [...run.options], commands: run.commands },
			timeoutlen: run.timeoutlen,
			strictkeys: run.strictkeys,
			luaActions: run.luaActions,
			warnings: [...run.warnings],
		},
	};
}
