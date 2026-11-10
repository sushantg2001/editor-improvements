import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import * as edits from "../../../../src/modules/editor-shortcuts/edits";

const stateOf = (doc: string, ...ranges: [number, number?][]) =>
	EditorState.create({
		doc,
		selection: EditorSelection.create(ranges.map(([anchor, head]) => EditorSelection.range(anchor, head ?? anchor))),
		extensions: [EditorState.allowMultipleSelections.of(true)],
	});

const deleted = (state: EditorState) => {
	const next = state.update(edits.deleteLine(state)!).state;
	return { text: next.doc.toString(), cursors: next.selection.ranges.map((r) => r.head) };
};

describe("deleting the lines of several cursors", () => {
	it("takes the last two lines whole, leaving no empty line behind", () => {
		const { text } = deleted(stateOf("a\nb\nc\nd", [4], [6]));

		expect(text).toBe("a\nb");
	});

	it("takes a cursor on the last line together with a range ending on it", () => {
		const { text } = deleted(stateOf("x\n\ny", [2], [3, 4]));

		expect(text).toBe("x");
	});

	it("takes every line when the cursors cover them all", () => {
		const { text } = deleted(stateOf("a\nb", [0], [2]));

		expect(text).toBe("");
	});

	it("takes neighbouring lines in the middle once", () => {
		const { text, cursors } = deleted(stateOf("a\nb\nc\nd\ne", [2], [4]));

		expect(text).toBe("a\nd\ne");
		expect(cursors).toEqual([2]);
	});

	it("keeps lines that are between cursors and puts each cursor on the line that took its place", () => {
		const { text, cursors } = deleted(stateOf("a\nb\nc\nd\ne", [0], [4]));

		expect(text).toBe("b\nd\ne");
		expect(cursors).toEqual([0, 2]);
	});

	it("keeps each cursor's column on the line that follows", () => {
		const { text, cursors } = deleted(stateOf("ab\ncdef\ngh\nijkl", [1], [9]));

		expect(text).toBe("cdef\nijkl");
		expect(cursors).toEqual([1, 6]);
	});

	it("takes a cursor on the last line and one earlier line separately", () => {
		const { text } = deleted(stateOf("a\nb\nc\nd", [0], [6]));

		expect(text).toBe("b\nc");
	});
});

/* A seeded sweep against the simplest statement of the rule. */

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

describe("deleting lines with several ranges leaves exactly the lines nobody touched", () => {
	it("on random documents and selections", () => {
		const pieces = ["a", "bb", "", "ccc", "- x", "  z", "😀"];
		for (let seed = 1; seed <= 1500; seed++) {
			const random = prng(seed);
			const lines = Array.from({ length: 1 + Math.floor(random() * 7) }, () => pieces[Math.floor(random() * pieces.length)]!);
			const doc = lines.join("\n");
			const ranges: [number, number][] = [];
			for (let i = 1 + Math.floor(random() * 3); i > 0; i--) {
				const at = (): number => {
					for (;;) {
						const offset = Math.floor(random() * (doc.length + 1));
						const before = doc.charCodeAt(offset - 1);
						const after = doc.charCodeAt(offset);
						if (!(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff)) {
							return offset;
						}
					}
				};
				const anchor = at();
				ranges.push([anchor, random() < 0.6 ? anchor : at()]);
			}
			const state = stateOf(doc, ...ranges);

			const touched = new Set<number>();
			for (const range of state.selection.ranges) {
				const first = state.doc.lineAt(range.from).number;
				let last = state.doc.lineAt(range.to);
				if (range.to > range.from && last.number > first && range.to === last.from) {
					last = state.doc.line(last.number - 1);
				}
				for (let n = first; n <= last.number; n++) {
					touched.add(n);
				}
			}
			const expected = lines.filter((_, index) => !touched.has(index + 1)).join("\n");

			expect(deleted(state).text, `seed ${seed} ${JSON.stringify(doc)} ${JSON.stringify(ranges)}`).toBe(expected);
		}
	});
});
