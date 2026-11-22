import { redo, selectAll, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import type { App } from "obsidian";
import type { Engine } from "../../engine/engine";
import { type ActionDef, type ActionResult, activeEditorView, type RunContext } from "../registry";
import { pasteClipboard } from "./desktop";

function viewFor(app: App, context: RunContext): EditorView | null {
	if (context.classified) return context.classified.editorView ?? null;
	return activeEditorView(app);
}

/** The document that holds the focus, which for a canvas card is an iframe's. */
function focusedDocument(context: RunContext): Document {
	const target = context.event?.target as Node | null | undefined;
	return target?.ownerDocument ?? activeDocument;
}

function textField(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
	const element = doc.activeElement;
	return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" ? (element as HTMLInputElement) : null;
}

function leaveVisual(engine: Engine, view: EditorView | null): void {
	if (!view) return;
	const mode = engine.mode(view);
	if (mode === "v" || mode === "x") engine.feedKeys(view, ["<Esc>"]);
}

/** The native editing actions, for desktop. */
export function nativeActions(app: App, engine: Engine): ActionDef[] {
	const define = (name: string, title: string, repeatable: boolean, run: (context: RunContext) => ActionResult): ActionDef => ({
		id: `native:${name}`,
		title,
		repeatable,
		run,
	});
	const clipboard = (command: "copy" | "cut") => (context: RunContext): ActionResult => {
		const done = focusedDocument(context).execCommand(command);
		if (done) leaveVisual(engine, viewFor(app, context));
		return done ? "handled" : "not-applicable";
	};
	const history = (command: (view: EditorView) => boolean) => (context: RunContext): ActionResult => {
		const view = viewFor(app, context);
		if (!view) return "not-applicable";
		command(view);
		return "handled";
	};
	return [
		define("copy", "Copy", false, clipboard("copy")),
		define("cut", "Cut", false, clipboard("cut")),
		define("paste", "Paste", true, () => {
			pasteClipboard();
			return "handled";
		}),
		define("paste-plain", "Paste as plain text", true, (context) => {
			const view = viewFor(app, context);
			const doc = focusedDocument(context);
			void navigator.clipboard.readText().then((text) => {
				if (view) view.dispatch(view.state.replaceSelection(text));
				else doc.execCommand("insertText", false, text);
			});
			return "handled";
		}),
		define("undo", "Undo", true, history(undo)),
		define("redo", "Redo", true, history(redo)),
		define("select-all", "Select all", false, (context) => {
			const view = viewFor(app, context);
			if (view) {
				const mode = engine.mode(view);
				if (mode === "i" || mode === "R") selectAll(view);
				else engine.feedKeys(view, mode === "n" ? ["g", "g", "V", "G"] : ["<Esc>", "g", "g", "V", "G"]);
				return "handled";
			}
			const field = textField(focusedDocument(context));
			if (!field) return "not-applicable";
			field.select();
			return "handled";
		}),
	];
}
