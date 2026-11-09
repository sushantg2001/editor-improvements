/**
 * Markdown list continuation: what to put at the start of a new line so a list
 * carries on, and how to renumber an ordered list after a line is inserted.
 */

/** A bullet, number, or blockquote marker, with an optional task checkbox. */
const LIST_MARKER = /^\s*(-|\+|\*|\d+\.|>) (\[.\] )?/;

/**
 * The prefix for a new line next to `text`.
 *
 * Returns "" when `text` is not a list item, `null` when it is an empty one
 * (the caller deletes it instead of continuing the list), and otherwise the
 * marker to continue with: ordered lists count up when the new line goes
 * after, and a task checkbox always starts unticked.
 */
export function nextListPrefix(text: string, direction: "before" | "after"): string | null {
	const match = LIST_MARKER.exec(text);
	if (!match) {
		return "";
	}
	if (match[0].trimStart() === text.trimStart()) {
		return null;
	}
	const marker = match[1] ?? "";
	const checkbox = match[2] ? "[ ] " : "";
	const ordered = /^(\d+)\.$/.exec(marker);
	const next =
		ordered && direction === "after" ? `${Number(ordered[1]) + 1}.` : marker;
	return `${next} ${checkbox}`;
}

/** True when the prefix is an ordered-list number, which later items must follow. */
export function isOrderedPrefix(prefix: string): boolean {
	return /^\d+\. /.test(prefix);
}

export interface LineEdit {
	from: number;
	to: number;
	insert: string;
}

/**
 * Edits that add one to the number of every consecutive ordered item at
 * `indentation`, starting at `lines[startIndex]`.
 */
export function renumberFrom(
	lines: { from: number; text: string }[],
	startIndex: number,
	indentation: string,
): LineEdit[] {
	const edits: LineEdit[] = [];
	const marker = new RegExp(`^${indentation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)\\.`);
	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i];
		const match = line ? marker.exec(line.text) : null;
		if (!line || !match) {
			break;
		}
		const numberStart = line.from + indentation.length;
		const numberText = match[1] ?? "";
		edits.push({
			from: numberStart,
			to: numberStart + numberText.length,
			insert: String(Number(numberText) + 1),
		});
	}
	return edits;
}

/** Characters the list marker occupies at the start of `text`, for joining lines. */
export function listMarkerLength(text: string): number {
	return LIST_MARKER.exec(text)?.[0].length ?? 0;
}
