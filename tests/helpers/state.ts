import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";

/**
 * Builds an editor state from a marked-up string, so a test reads as a picture:
 *
 *   `|`      a cursor
 *   `«abc»`  a selected range, head at the right
 *
 * Several markers make several ranges.
 */
export function stateOf(marked: string): EditorState {
	const ranges = [];
	let doc = "";
	let open = -1;
	for (const char of marked) {
		if (char === "|") {
			ranges.push(EditorSelection.cursor(doc.length));
		} else if (char === "«") {
			open = doc.length;
		} else if (char === "»") {
			ranges.push(EditorSelection.range(open, doc.length));
			open = -1;
		} else {
			doc += char;
		}
	}
	return EditorState.create({
		doc,
		selection: EditorSelection.create(ranges.length > 0 ? ranges : [EditorSelection.cursor(0)]),
		extensions: [EditorState.allowMultipleSelections.of(true)],
	});
}

/** The inverse of `stateOf`. */
export function show(state: EditorState): string {
	const marks: { at: number; text: string }[] = [];
	for (const range of state.selection.ranges) {
		if (range.empty) {
			marks.push({ at: range.from, text: "|" });
		} else {
			marks.push({ at: range.from, text: "«" }, { at: range.to, text: "»" });
		}
	}
	let out = "";
	const doc = state.doc.toString();
	for (let i = 0; i <= doc.length; i++) {
		for (const mark of marks.filter((m) => m.at === i)) {
			out += mark.text;
		}
		out += doc.charAt(i);
	}
	return out;
}

/** Runs an edit on a marked-up document and returns the marked-up result, or null for no change. */
export function run(
	edit: (state: EditorState) => TransactionSpec | null,
	marked: string,
): string | null {
	const state = stateOf(marked);
	const spec = edit(state);
	return spec ? show(state.update(spec).state) : null;
}
