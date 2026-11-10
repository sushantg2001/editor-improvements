import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";
import * as moves from "../../../../src/modules/editor-shortcuts/movement";
import { offsetAtColumn } from "../../../../src/modules/editor-shortcuts/text";

/**
 * Columns count UTF-16 units, so a command that keeps the column from one line
 * to another can end up inside an emoji, or between a letter and its accent.
 */

const stateAt = (doc: string, anchor: number, head = anchor) =>
	EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });

describe("offsetAtColumn", () => {
	const line = (text: string) => ({ from: 10, text });

	it("is the column on the line when it falls between characters", () => {
		expect(offsetAtColumn(line("abc"), 2)).toBe(12);
		expect(offsetAtColumn(line("😀x"), 2)).toBe(12);
	});

	it("is the start of an emoji when the column falls inside it", () => {
		expect(offsetAtColumn(line("a😀"), 2)).toBe(11);
	});

	it("is the start of a letter when the column falls between it and its accent", () => {
		expect(offsetAtColumn(line("xéy"), 2)).toBe(11);
	});

	it("is the end of the line when the column is past it", () => {
		expect(offsetAtColumn(line("ab"), 5)).toBe(12);
		expect(offsetAtColumn(line(""), 3)).toBe(10);
	});
});

describe("moving to another line keeps the column without splitting a character", () => {
	it("down onto an emoji", () => {
		const state = stateAt("abc\n😀x", 1);

		expect(moves.lineBelow(state, 1, 1)).toBe(4);
	});

	it("up onto an emoji", () => {
		const state = stateAt("😀x\nabc", 5);

		expect(moves.lineAbove(state, 5, 1)).toBe(0);
	});

	it("still lands after an emoji when the column is on the other side of it", () => {
		const state = stateAt("abc\n😀x", 2);

		expect(moves.lineBelow(state, 2, 1)).toBe(6);
	});
});

describe("deleting a line keeps the column without splitting a character", () => {
	it("when a line follows", () => {
		const state = stateAt("ab\n😀x", 1);

		const next = state.update(edits.deleteLine(state)!).state;

		expect(next.doc.toString()).toBe("😀x");
		expect(next.selection.main.head).toBe(0);
	});

	it("when the last line goes and the one before is taken", () => {
		const state = stateAt("😀x\nab", 4);

		const next = state.update(edits.deleteLine(state)!).state;

		expect(next.doc.toString()).toBe("😀x");
		expect(next.selection.main.head).toBe(0);
	});
});

/* ------------------------------------------------------------- random text */

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
	"a", "b", "word", "😀", "👍", "👨‍👩‍👧", "é", "𝒳y", "日本", " ", "\n", "\n\n", "- ", "1. ", "(", ")", '"', "# ",
];

const inside = (text: string, offset: number): boolean => {
	const before = text.charCodeAt(offset - 1);
	const after = text.charCodeAt(offset);
	return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
};

/** A document and a selection, both between the characters of the text. */
function randomState(seed: number): EditorState {
	const random = prng(seed);
	let doc = "";
	for (let i = Math.floor(random() * 25); i > 0; i--) {
		doc += PIECES[Math.floor(random() * PIECES.length)];
	}
	const pick = (): number => {
		for (let tries = 0; tries < 20; tries++) {
			const offset = Math.floor(random() * (doc.length + 1));
			if (!inside(doc, offset)) {
				return offset;
			}
		}
		return 0;
	};
	const anchor = pick();
	return stateAt(doc, anchor, random() < 0.5 ? anchor : pick());
}

const EDITS: [string, edits.Edit][] = [
	["insertLineBelow", edits.insertLineBelow({ continueLists: true })],
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
	["changeCase title", edits.changeCase("title")],
	["selectByWord before", edits.selectByWord("before")],
	["selectByWord after", edits.selectByWord("after")],
];

const MOVES: [string, moves.Move][] = [
	["lineBelow", moves.lineBelow],
	["lineAbove", moves.lineAbove],
	["charForward", moves.charForward],
	["charBackward", moves.charBackward],
	["wordForward", moves.wordForward],
	["wordBackward", moves.wordBackward],
];

describe("no command leaves a cursor or a selection edge inside a character", () => {
	for (const [name, edit] of EDITS) {
		it(name, () => {
			for (let seed = 1; seed <= 600; seed++) {
				const state = randomState(seed);
				const spec = edit(state);
				if (!spec) {
					continue;
				}
				const next = state.update(spec).state;
				const text = next.doc.toString();
				for (const range of next.selection.ranges) {
					for (const offset of [range.from, range.to]) {
						expect(inside(text, offset), `seed ${seed} ${JSON.stringify(state.doc.toString())} -> ${JSON.stringify(text)} at ${offset}`).toBe(false);
					}
				}
			}
		});
	}

	for (const [name, move] of MOVES) {
		it(`${name} lands between characters`, () => {
			for (let seed = 1; seed <= 600; seed++) {
				const state = randomState(seed);
				const to = move(state, state.selection.main.head, 1 + (seed % 3));
				expect(inside(state.doc.toString(), to), `seed ${seed} ${JSON.stringify(state.doc.toString())} at ${to}`).toBe(false);
			}
		});
	}
});
