type ElementInfo =
	| string
	| {
			cls?: string | string[];
			text?: string;
			attr?: Record<string, string | number | boolean | null>;
	  };

function applyInfo(el: HTMLElement, info?: ElementInfo): void {
	if (typeof info === "string") {
		el.className = info;
		return;
	}
	if (!info) {
		return;
	}
	if (info.cls) {
		el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
	}
	if (info.text) {
		el.textContent = info.text;
	}
	if (info.attr) {
		for (const [key, value] of Object.entries(info.attr)) {
			if (value !== null) {
				el.setAttribute(key, String(value));
			}
		}
	}
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

proto.createEl = function (
	this: HTMLElement,
	tag: string,
	info?: ElementInfo,
	callback?: (el: HTMLElement) => void,
) {
	const el = document.createElement(tag);
	applyInfo(el, info);
	this.appendChild(el);
	callback?.(el);
	return el;
};

proto.empty = function (this: HTMLElement) {
	while (this.firstChild) {
		this.removeChild(this.firstChild);
	}
};

proto.setText = function (this: HTMLElement, text: string) {
	this.textContent = text;
};

proto.addClass = function (this: HTMLElement, ...classes: string[]) {
	this.classList.add(...classes);
};

proto.removeClass = function (this: HTMLElement, ...classes: string[]) {
	this.classList.remove(...classes);
};

proto.toggleClass = function (this: HTMLElement, cls: string, value: boolean) {
	this.classList.toggle(cls, value);
};

export type EventRef = { name: string; callback: CallableFunction };

class Events {
	private handlers: EventRef[] = [];

	on(name: string, callback: CallableFunction): EventRef {
		const ref = { name, callback };
		this.handlers.push(ref);
		return ref;
	}

	off(ref: EventRef): void {
		this.handlers = this.handlers.filter((h) => h !== ref);
	}

	trigger(name: string, ...args: unknown[]): void {
		for (const handler of this.handlers) {
			if (handler.name === name) {
				(handler.callback as (...callbackArgs: unknown[]) => void)(...args);
			}
		}
	}
}

export function normalizePath(path: string): string {
	const normalized = path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized === "" ? "/" : normalized;
}

/** In-memory stand-in for Obsidian's DataAdapter, enough for the script host. */
export class DataAdapter {
	files = new Map<string, string>();
	dirs = new Set<string>();

	async exists(path: string): Promise<boolean> {
		const p = normalizePath(path);
		return this.files.has(p) || this.dirs.has(p);
	}

	async read(path: string): Promise<string> {
		const p = normalizePath(path);
		const content = this.files.get(p);
		if (content === undefined) {
			throw new Error(`ENOENT: ${p}`);
		}
		return content;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(normalizePath(path), data);
	}

	async mkdir(path: string): Promise<void> {
		this.dirs.add(normalizePath(path));
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const prefix = `${normalizePath(path)}/`;
		return {
			files: [...this.files.keys()].filter(
				(p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
			),
			folders: [...this.dirs].filter(
				(p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
			),
		};
	}
}

export class MarkdownView {
	editor: unknown = null;
}

export class Workspace extends Events {
	activeView: MarkdownView | null = null;
	activeFile: unknown = null;
	layoutReadyCallbacks: (() => void)[] = [];

	getActiveFile(): unknown {
		return this.activeFile;
	}

	getActiveViewOfType(): MarkdownView | null {
		return this.activeView;
	}

	onLayoutReady(callback: () => void): void {
		this.layoutReadyCallbacks.push(callback);
	}

	/** Test helper: run everything queued via `onLayoutReady`. */
	flushLayoutReady(): void {
		for (const callback of this.layoutReadyCallbacks) {
			callback();
		}
	}
}

export class MetadataCache {
	/** Test helper: heading line numbers per file object. */
	headings = new Map<unknown, number[]>();

	getFileCache(file: unknown): { headings?: { position: { start: { line: number } } }[] } | null {
		const lines = this.headings.get(file);
		return lines
			? { headings: lines.map((line) => ({ position: { start: { line } } })) }
			: null;
	}
}

export class Vault extends Events {
	adapter = new DataAdapter();
	config = new Map<string, unknown>();

	getConfig(key: string): unknown {
		return this.config.get(key);
	}

	setConfig(key: string, value: unknown): void {
		this.config.set(key, value);
	}
	/** Obsidian lets users rename this; it is not always `.obsidian`. */
	configDir = ".obsidian";
}

export class App {
	workspace = new Workspace();
	vault = new Vault();
	metadataCache = new MetadataCache();
	vimEnabled = false;

	isVimEnabled(): boolean {
		return this.vimEnabled;
	}
}

export class Component {
	private cleanups: (() => void)[] = [];
	children: Component[] = [];
	loaded = false;

	load(): void {
		this.loaded = true;
		(this as unknown as { onload?: () => void }).onload?.();
	}

	/**
	 * Mirrors Obsidian's real ordering exactly: children are unloaded first,
	 * then registered cleanups run in reverse (LIFO), then `onunload`. Getting
	 * this wrong in the mock hides teardown-ordering bugs, so it matters.
	 */
	unload(): void {
		this.loaded = false;
		while (this.children.length > 0) {
			this.children.pop()?.unload();
		}
		while (this.cleanups.length > 0) {
			this.cleanups.pop()?.();
		}
		(this as unknown as { onunload?: () => void }).onunload?.();
	}

	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		child.load();
		return child;
	}

	register(cleanup: () => void): void {
		this.cleanups.push(cleanup);
	}

	registerEvent(): void {}
	registerDomEvent(): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class Plugin extends Component {
	app: App;
	settingsData: unknown = null;
	commands: unknown[] = [];

	constructor(app: App = new App()) {
		super();
		this.app = app;
	}

	addCommand(command: unknown): unknown {
		this.commands.push(command);
		return command;
	}

	removeCommand(id: string): void {
		this.commands = this.commands.filter((command) => (command as { id: string }).id !== id);
	}

	settingTab: unknown = null;

	addSettingTab(tab: unknown): void {
		this.settingTab = tab;
	}

	addStatusBarItem(): HTMLElement {
		const el = document.createElement("div");
		document.body.appendChild(el);
		return el;
	}

	async loadData(): Promise<unknown> {
		return this.settingsData;
	}

	async saveData(data: unknown): Promise<void> {
		this.settingsData = data;
	}
}

export class Notice {
	static messages: string[] = [];

	constructor(message: string) {
		Notice.messages.push(message);
	}
}

export class PluginSettingTab {
	app: App;
	containerEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.containerEl = document.createElement("div");
	}
}

class BaseComponent {
	value: unknown = null;
	changeHandler: ((value: unknown) => void) | null = null;

	onChange(handler: (value: unknown) => void): this {
		this.changeHandler = handler;
		return this;
	}

	setValue(value: unknown): this {
		this.value = value;
		return this;
	}

	setPlaceholder(): this {
		return this;
	}
}

export class Setting {
	/** Test helper: every setting built since the last reset, in order. */
	static created: Setting[] = [];

	settingEl: HTMLElement;
	name = "";
	heading = false;
	components: BaseComponent[] = [];

	constructor(containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		containerEl.appendChild(this.settingEl);
		Setting.created.push(this);
	}

	setName(name: string): this {
		this.name = name;
		return this;
	}

	setDesc(): this {
		return this;
	}

	setHeading(): this {
		this.heading = true;
		return this;
	}

	addToggle(callback: (component: BaseComponent) => void): this {
		const component = new BaseComponent();
		this.components.push(component);
		callback(component);
		return this;
	}

	addText(callback: (component: BaseComponent) => void): this {
		const component = new BaseComponent();
		this.components.push(component);
		callback(component);
		return this;
	}
}

export abstract class SuggestModal<T> {
	limit = 100;
	placeholder = "";
	emptyStateText = "";
	opened = false;

	constructor(public app: App) {}

	setPlaceholder(text: string): void {
		this.placeholder = text;
	}

	open(): void {
		this.opened = true;
	}

	abstract getSuggestions(query: string): T[];
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(value: T): void;
}
