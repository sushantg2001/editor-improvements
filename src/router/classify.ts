import { EditorView } from "@codemirror/view";
import type { Classified, Context } from "../actions/registry";
import type { Engine } from "../engine/engine";

export interface ClassifyDeps {
	engine: Engine;
	/** True when the scope right below the router is the workspace's. */
	workspaceBelow(win: Window): boolean;
	activeViewType(): string | null;
}

const VIEW_TYPES = new Set(["graph", "canvas", "pdf", "file-explorer", "image", "bases", "search", "outline", "backlink", "tag", "bookmarks"]);

/** A card's editor lives in an iframe, so walk up to the window Obsidian tracks. */
export function hostWindow(event: Event): Window {
	const target = event.target as Node | null;
	let win: Window = target?.ownerDocument?.defaultView ?? (event as UIEvent).view ?? activeWindow;
	for (let depth = 0; depth < 4 && win.frameElement; depth++) {
		win = win.frameElement.ownerDocument.defaultView ?? win;
	}
	return win;
}

/** Decides the one context a key belongs to. The first matching rule wins. */
export function classify(event: KeyboardEvent, deps: ClassifyDeps): Classified {
	const win = hostWindow(event);
	if (!deps.workspaceBelow(win)) {
		const context: Context = win.document.querySelector(".modal-container") ? "modal" : "transient";
		return { context, win };
	}
	// Not `instanceof`: a target in a canvas card belongs to the iframe's realm.
	const target = event.target as (Partial<HTMLElement> & { closest?: Element["closest"] }) | null;
	const editorElement = target?.closest?.<HTMLElement>(".cm-editor");
	if (editorElement) {
		const view = EditorView.findFromDOM(editorElement);
		if (view && deps.engine.isAttached(view)) {
			const inPrompt = target?.tagName === "INPUT";
			return { context: "editor", mode: inPrompt ? "c" : deps.engine.mode(view), win, editorView: view };
		}
	}
	if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return { context: "input", win };
	const viewType = deps.activeViewType();
	if (viewType && VIEW_TYPES.has(viewType)) return { context: `view:${viewType}`, viewType, win };
	return { context: "global", win };
}

/** The contexts to search for a mapping, the most specific first. */
export function contextChain(classified: Classified): string[] {
	switch (classified.context) {
		case "editor": {
			const mode = classified.mode ?? "n";
			return mode === "x" ? ["editor:x", "editor:v", "editor", "global"] : [`editor:${mode}`, "editor", "global"];
		}
		case "modal":
			return ["modal", "transient", "global"];
		case "transient":
			return ["transient", "global"];
		case "input":
			return ["input", "global"];
		case "global":
			return ["global"];
		default:
			return [classified.context, "global"];
	}
}
