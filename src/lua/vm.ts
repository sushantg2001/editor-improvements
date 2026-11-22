import { lauxlib, lua, to_jsstring, to_luastring } from "./runtime/index";
import { luaopen_base } from "./runtime/lbaselib";
import { luaopen_math } from "./runtime/lmathlib";
import type { lua_State } from "./runtime/lstate";
import { luaopen_string } from "./runtime/lstrlib";
import { luaopen_table } from "./runtime/ltablib";
import { luaopen_utf8 } from "./runtime/lutf8lib";

export type LuaState = lua_State;

/** Lua string to JavaScript string. */
export const js = (text: Uint8Array | null): string => to_jsstring(text as Uint8Array);

/** Instructions `init.lua` may run. */
export const LOAD_LIMIT = 1_000_000;
/** Instructions one mapping callback may run. */
export const CALL_LIMIT = 200_000;

/** A fresh state with the safe libraries only: no os, debug, coroutine or file access. */
export function newState(): LuaState {
	const L = lauxlib.luaL_newstate() as LuaState;
	const libraries: [string, (state: LuaState) => number][] = [
		["_G", luaopen_base],
		["table", luaopen_table],
		["string", luaopen_string],
		["math", luaopen_math],
		["utf8", luaopen_utf8],
	];
	for (const [name, open] of libraries) {
		lauxlib.luaL_requiref(L, to_luastring(name), open, 1);
		lua.lua_pop(L, 1);
	}
	for (const name of ["dofile", "loadfile"]) {
		lua.lua_pushnil(L);
		lua.lua_setglobal(L, to_luastring(name));
	}
	return L;
}

export function toText(L: LuaState, index: number): string {
	return lua.lua_isstring(L, index) ? js(lua.lua_tostring(L, index)) : `(${js(lua.lua_typename(L, lua.lua_type(L, index)))})`;
}

/** Raises a Lua error with the caller's file and line. */
export function raise(L: LuaState, message: string): never {
	lauxlib.luaL_error(L, to_luastring("%s"), to_luastring(message));
	throw new Error(message);
}

let depth = 0;

const stop = (state: LuaState): void => {
	// Fire on every instruction from now on, so a `pcall` in a loop cannot outlast it.
	lua.lua_sethook(state, stop, lua.LUA_MASKCOUNT, 1);
	lauxlib.luaL_error(state, to_luastring("instruction limit exceeded"));
};

/** Calls the function on the stack under an instruction limit. Returns the error, or null. */
export function guardedCall(L: LuaState, args: number, results: number, limit: number): string | null {
	if (depth === 0) lua.lua_sethook(L, stop, lua.LUA_MASKCOUNT, limit);
	depth++;
	let status: number;
	try {
		status = lua.lua_pcall(L, args, results, 0);
	} finally {
		depth--;
		if (depth === 0) lua.lua_sethook(L, null, 0, 0);
	}
	if (status === lua.LUA_OK) return null;
	const message = toText(L, -1);
	lua.lua_pop(L, 1);
	return message;
}

/** Compiles a chunk onto the stack. Returns the error, or null. */
export function loadChunk(L: LuaState, source: string, name: string): string | null {
	const bytes = to_luastring(source);
	if (lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`@${name}`)) === lua.LUA_OK) return null;
	const message = toText(L, -1);
	lua.lua_pop(L, 1);
	return message;
}
