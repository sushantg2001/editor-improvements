// Every undocumented Obsidian member the router touches, and nothing else.
import { type App, Scope } from "obsidian";

interface HotkeyEntry {
	key: string | null;
	modifiers: string | null;
}

interface InternalScope {
	keys: HotkeyEntry[];
	parent: unknown;
}

export interface WindowStack {
	scope: Scope;
	prevScopes: Scope[];
}

interface InternalKeymap {
	getWindowStack(win: Window): WindowStack;
	pushScope(scope: Scope): void;
	popScope(scope: Scope): void;
}

const keymapOf = (app: App): InternalKeymap => app.keymap as unknown as InternalKeymap;
const rootKeys = (app: App): HotkeyEntry[] => (app.scope as unknown as InternalScope).keys;
const isHotkeyEntry = (entry: HotkeyEntry): boolean => entry.key === null && entry.modifiers === null;

/** True when Obsidian's single catch-all hotkey handler is where it is expected. */
export function hasHotkeyEntry(app: App): boolean {
	const keys = rootKeys(app);
	return Array.isArray(keys) && keys.filter(isHotkeyEntry).length === 1;
}

/** Removes Obsidian's hotkey handler. Returns the function that puts it back. */
export function removeHotkeyEntry(app: App): (() => void) | null {
	if (!hasHotkeyEntry(app)) return null;
	const keys = rootKeys(app);
	const [entry] = keys.splice(keys.findIndex(isHotkeyEntry), 1);
	if (!entry) return null;
	return () => {
		if (!rootKeys(app).includes(entry)) rootKeys(app).unshift(entry);
	};
}

export function hasWindowStack(app: App): boolean {
	const stack = keymapOf(app).getWindowStack?.(window);
	return !!stack && Array.isArray(stack.prevScopes) && "scope" in stack;
}

export function scopeBelow(app: App, win: Window): Scope | undefined {
	return keymapOf(app).getWindowStack(win).prevScopes.at(-1);
}

export function isWorkspaceBelow(app: App, win: Window): boolean {
	return scopeBelow(app, win) === (app.workspace as unknown as { scope: Scope }).scope;
}

/** Puts `scope` on top of a window's stack, with its parent tracking the scope below. */
export function keepOnTop(app: App, win: Window, scope: Scope): void {
	const stack = keymapOf(app).getWindowStack(win);
	if (stack.scope !== scope) {
		for (let at = stack.prevScopes.indexOf(scope); at >= 0; at = stack.prevScopes.indexOf(scope)) stack.prevScopes.splice(at, 1);
		stack.prevScopes.push(stack.scope);
		stack.scope = scope;
	}
	(scope as unknown as InternalScope).parent = stack.prevScopes.at(-1) ?? null;
}

/** Takes `scope` out of a window's stack. */
export function removeFromStack(app: App, win: Window, scope: Scope): void {
	const stack = keymapOf(app).getWindowStack(win);
	if (stack.scope === scope) stack.scope = stack.prevScopes.pop() ?? app.scope;
	for (let at = stack.prevScopes.indexOf(scope); at >= 0; at = stack.prevScopes.indexOf(scope)) stack.prevScopes.splice(at, 1);
}

/** Calls `after` following every push and pop. Returns the function that undoes it. */
export function watchScopes(app: App, after: () => void): () => void {
	const keymap = keymapOf(app);
	const ownPush = Object.hasOwn(keymap, "pushScope");
	const ownPop = Object.hasOwn(keymap, "popScope");
	// eslint-disable-next-line @typescript-eslint/unbound-method -- called with the keymap, and put back as found
	const push = keymap.pushScope;
	// eslint-disable-next-line @typescript-eslint/unbound-method -- called with the keymap, and put back as found
	const pop = keymap.popScope;
	keymap.pushScope = function (scope: Scope): void {
		push.call(keymap, scope);
		after();
	};
	keymap.popScope = function (scope: Scope): void {
		pop.call(keymap, scope);
		after();
	};
	return () => {
		const patched = keymap as Partial<InternalKeymap>;
		if (ownPush) keymap.pushScope = push;
		else delete patched.pushScope;
		if (ownPop) keymap.popScope = pop;
		else delete patched.popScope;
	};
}

export function newScope(handler: (event: KeyboardEvent) => false | undefined): Scope {
	const scope = new Scope();
	scope.register(null, null, handler);
	return scope;
}
