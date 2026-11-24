// The `obsidian` package has types only, so tests get a small stand-in.
import { mock } from "bun:test";
import { StateField } from "@codemirror/state";
import { Window } from "happy-dom";

const page = new Window({ url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Node", "Element", "HTMLElement", "KeyboardEvent", "MouseEvent", "Event", "Range", "Text", "DocumentFragment", "CustomEvent", "getSelection", "ResizeObserver"]) {
	const value = (page as unknown as Record<string, unknown>)[name];
	if (value !== undefined) Object.defineProperty(globalThis, name, { value: typeof value === "function" && !/^[A-Z]/.test(name) ? value.bind(page) : value, configurable: true, writable: true });
}
Object.assign(globalThis, { activeDocument: page.document, activeWindow: page });

const editorLivePreviewField = StateField.define<boolean>({ create: () => false, update: (value) => value });

class Scope {
	keys: unknown[] = [];
	parent: unknown = null;
	register(modifiers: unknown, key: unknown, func: unknown): void {
		this.keys.push({ modifiers, key, func });
	}
}

void mock.module("obsidian", () => ({ editorLivePreviewField, Scope, Platform: { isMobile: false, isDesktopApp: true, isMacOS: false }, Notice: class {} }));
