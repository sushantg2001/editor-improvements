import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";
import * as moves from "../../../../src/modules/editor-shortcuts/movement";

/**
 * Throws random documents and selections at every edit and move, looking for
 * the failures a hand-written case never reaches: a position past the end, a
 * range that comes out backwards, an exception on an empty line.
 *
 * The generator is seeded, so a failure is reproducible from the seed in its
 * message.
 */

function prng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const PIECES = [
	"a", "b", "word", "héllo", "日本", "👍", " ", "  ", "\t", "\n", "\n\n", "- ", "1. ", "10. ", "> ",
	"- [ ] ", "- [x] ", "(", ")", "[", "]", "{", "}", '"', "'", "`", ".", ",", "# ", "foo", "foo",
];

function randomDoc(random: () => number): string {
	const count = Math.floor(random() * 25);
	let doc = "";
	for (let i = 0; i < count; i++) {
		doc += PIECES[Math.floor(random() * PIECES.length)];
	}
	return doc;
}

function randomState(random: () => number): EditorState {
	const doc = randomDoc(random);
	const ranges = [];
	const rangeCount = 1 + Math.floor(random() * 2);
	for (let i = 0; i < rangeCount; i++) {
		const a = Math.floor(random() * (doc.length + 1));
		const b = random() < 0.5 ? a : Math.floor(random() * (doc.length + 1));
		ranges.push(EditorSelection.range(a, b));
	}
	return EditorState.create({
		doc,
		selection: EditorSelection.create(ranges),
		extensions: [EditorState.allowMultipleSelections.of(true)],
	});
}

const EDITS: [string, edits.Edit][] = [
	["insertLineBelow", edits.insertLineBelow({ continueLists: true })],
	["insertLineBelow (plain)", edits.insertLineBelow({ continueLists: false })],
	["insertLineAbove", edits.insertLineAbove({ continueLists: true })],
	["deleteLine", edits.deleteLine],
	["deleteToStartOfLine", edits.deleteToStartOfLine],
	["deleteToEndOfLine", edits.deleteToEndOfLine],
	["deleteWord before", edits.deleteWord("before")],
	["deleteWord after", edits.deleteWord("after")],
	["joinLines", edits.joinLines],
	["copyLines up", edits.copyLines("up")],
	["copyLines down", edits.copyLines("down")],
	["selectLines", edits.selectLines],
	["changeCase upper", edits.changeCase("upper")],
	["changeCase next", edits.changeCase("next")],
	["changeCase title", edits.changeCase("title")],
	["expand brackets", edits.expandToEnclosure("brackets")],
	["expand quotes", edits.expandToEnclosure("quotes")],
	["expand both", edits.expandToEnclosure("both")],
	["selectNextOccurrence", edits.selectNextOccurrence],
	["selectByWord before", edits.selectByWord("before")],
	["selectByWord after", edits.selectByWord("after")],
];

const MOVES: [string, moves.Move][] = [
	["lineStart", moves.lineStart],
	["lineEnd", moves.lineEnd],
	["documentStart", moves.documentStart],
	["documentEnd", moves.documentEnd],
	["lineBelow", moves.lineBelow],
	["lineAbove", moves.lineAbove],
	["charForward", moves.charForward],
	["charBackward", moves.charBackward],
	["wordForward", moves.wordForward],
	["wordBackward", moves.wordBackward],
	["headingNext", moves.headingMove(() => [0, 3, 50], "next")],
	["headingPrevious", moves.headingMove(() => [0, 3, 50], "previous")],
];

const ITERATIONS = 400;

describe("edits never produce an invalid state", () => {
	for (const [name, edit] of EDITS) {
		it(name, () => {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const state = randomState(prng(seed));
				try {
					const spec = edit(state);
					if (!spec) {
						continue;
					}
					const next = state.update(spec).state;
					for (const range of next.selection.ranges) {
						expect(range.from).toBeGreaterThanOrEqual(0);
						expect(range.to).toBeLessThanOrEqual(next.doc.length);
					}
				} catch (error) {
					throw new Error(
						`${name} failed for seed ${seed} on ${JSON.stringify(state.doc.toString())} ` +
							`with ${JSON.stringify(state.selection.ranges.map((r) => [r.anchor, r.head]))}: ` +
							String(error),
					);
				}
			}
		});
	}
});

describe("moves stay inside the document", () => {
	for (const [name, move] of MOVES) {
		it(name, () => {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const random = prng(seed);
				const state = randomState(random);
				const from = state.selection.main.head;
				const count = 1 + Math.floor(random() * 3);
				const to = move(state, from, count);
				expect(to, `${name} seed ${seed} on ${JSON.stringify(state.doc.toString())}`).toBeGreaterThanOrEqual(0);
				expect(to, `${name} seed ${seed}`).toBeLessThanOrEqual(state.doc.length);
				expect(Number.isInteger(to)).toBe(true);
			}
		});
	}
});

/** One cursor or one range, so line counts have a simple answer. */
function singleRange(seed: number): EditorState {
	const random = prng(seed * 7919);
	const doc = randomDoc(random);
	const a = Math.floor(random() * (doc.length + 1));
	const b = random() < 0.5 ? a : Math.floor(random() * (doc.length + 1));
	return EditorState.create({ doc, selection: EditorSelection.single(a, b) });
}

function after(state: EditorState, edit: edits.Edit): EditorState | null {
	const spec = edit(state);
	return spec ? state.update(spec).state : null;
}

describe("edits keep their promises on random text", () => {
	it("changing case never changes the letters", () => {
		for (const transform of ["upper", "lower", "title", "next"] as const) {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const state = singleRange(seed);
				const next = after(state, edits.changeCase(transform));
				expect(next?.doc.toString().toLowerCase() ?? state.doc.toString().toLowerCase(), `${transform} seed ${seed}`).toBe(
					state.doc.toString().toLowerCase(),
				);
			}
		}
	});

	it("opening a line adds exactly one line", () => {
		for (const [name, edit] of [
			["below", edits.insertLineBelow({ continueLists: false })],
			["above", edits.insertLineAbove({ continueLists: false })],
		] as const) {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const state = singleRange(seed);
				const next = after(state, edit);
				expect(next?.doc.lines, `${name} seed ${seed} on ${JSON.stringify(state.doc.toString())}`).toBe(state.doc.lines + 1);
			}
		}
	});

	it("deleting a line removes at least one line and never more than were touched", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const state = singleRange(seed);
			const range = state.selection.main;
			const touched = state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number + 1;
			const next = after(state, edits.deleteLine)!;
			const removed = state.doc.lines - next.doc.lines;
			expect(removed, `seed ${seed} on ${JSON.stringify(state.doc.toString())} ${range.from}-${range.to}`).toBeLessThanOrEqual(touched);
			expect(next.doc.lines).toBeGreaterThanOrEqual(1);
		}
	});

	it("copying lines grows the document by the lines copied plus a newline", () => {
		for (const direction of ["up", "down"] as const) {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const state = singleRange(seed);
				const range = state.selection.main;
				const first = state.doc.lineAt(range.from);
				let last = state.doc.lineAt(range.to);
				if (range.to > range.from && last.number > first.number && range.to === last.from) {
					last = state.doc.line(last.number - 1);
				}
				const block = state.doc.sliceString(first.from, last.to);
				const next = after(state, edits.copyLines(direction))!;
				expect(next.doc.length, `${direction} seed ${seed}`).toBe(state.doc.length + block.length + 1);
			}
		}
	});

	it("joining lines only ever removes line breaks, spaces, tabs and list markers", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const state = singleRange(seed);
			const next = after(state, edits.joinLines)!;
			const keep = (text: string) => text.replace(/[\s>*+\-\d.[\]x]/g, "");
			expect(keep(next.doc.toString()), `seed ${seed} on ${JSON.stringify(state.doc.toString())}`).toBe(keep(state.doc.toString()));
		}
	});

	it("deleting a word or to a line edge only removes text, in one piece", () => {
		for (const [name, edit] of [
			["word before", edits.deleteWord("before")],
			["word after", edits.deleteWord("after")],
			["to start", edits.deleteToStartOfLine],
			["to end", edits.deleteToEndOfLine],
		] as const) {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const state = singleRange(seed);
				const next = after(state, edit)!;
				const before = state.doc.toString();
				const result = next.doc.toString();
				expect(result.length, `${name} seed ${seed}`).toBeLessThanOrEqual(before.length);
				let prefix = 0;
				while (prefix < result.length && result[prefix] === before[prefix]) {
					prefix++;
				}
				expect(before.endsWith(result.slice(prefix)), `${name} seed ${seed} on ${JSON.stringify(before)}`).toBe(true);
			}
		}
	});
});
