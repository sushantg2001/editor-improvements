import { describe, expect, test } from "bun:test";
import { toEngine } from "../../src/notation/engine";
import { fromEvent, type KeyEvent } from "../../src/notation/event";
import { isChord, parseKeys } from "../../src/notation/parse";

const event = (fields: Partial<KeyEvent> & { key: string }, altGraph = false): KeyEvent => ({
	code: "", keyCode: 0, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false,
	getModifierState: (name: string) => altGraph && name === "AltGraph",
	...fields,
});

describe("key notation", () => {
	test("NOTATION-A1: names, aliases and case are canonical", () => {
		expect(parseKeys("<esc><ESCAPE><Enter><return><BackSpace><delete>")).toEqual(["<Esc>", "<Esc>", "<CR>", "<CR>", "<BS>", "<Del>"]);
		expect(parseKeys("<M-x><a-X><d-s>")).toEqual(["<A-x>", "<A-S-x>", "<D-s>"]);
		expect(parseKeys("<S-Tab><C-S-Tab><F12><Space><lt><Bslash><Bar>")).toEqual(["<S-Tab>", "<C-S-Tab>", "<F12>", "<Space>", "<lt>", "<Bslash>", "<Bar>"]);
		expect(parseKeys("gj")).toEqual(["g", "j"]);
	});

	test("NOTATION-A2: Shift is part of a letter", () => {
		expect(parseKeys("<C-A>")).toEqual(parseKeys("<C-S-a>"));
		expect(parseKeys("<S-a>")).toEqual(["A"]);
	});

	test("an unknown <word> is typed literally, and a bad chord is an error", () => {
		expect(parseKeys("<foo>")).toEqual(["<lt>", "f", "o", "o", ">"]);
		expect(() => parseKeys("<C-nope>")).toThrow("Unknown key");
	});

	test("NOTATION-A6: leader expands when parsed", () => {
		expect(parseKeys("<leader>x", ",")).toEqual([",", "x"]);
		expect(parseKeys("<leader>x", " ")).toEqual(["<Space>", "x"]);
		expect(parseKeys("<Leader>x")).toEqual(["<Bslash>", "x"]);
	});

	test("NOTATION-A3: a chord reads the character the layout produces", () => {
		expect(fromEvent(event({ key: "c", code: "KeyC", ctrlKey: true }))).toBe("<C-c>");
		expect(fromEvent(event({ key: "a", code: "KeyQ", ctrlKey: true }))).toBe("<C-a>");
		expect(fromEvent(event({ key: "C", code: "KeyC", ctrlKey: true, shiftKey: true }))).toBe("<C-S-c>");
		expect(fromEvent(event({ key: "Unidentified", code: "KeyK", ctrlKey: true }))).toBeNull();
		expect(fromEvent(event({ key: "Tab", shiftKey: true }))).toBe("<S-Tab>");
		expect(fromEvent(event({ key: " " }))).toBe("<Space>");
	});

	test("NOTATION-A4: AltGr types a plain character", () => {
		expect(fromEvent(event({ key: "@", code: "KeyQ", ctrlKey: true, altKey: true }, true))).toBe("@");
	});

	test("NOTATION-A5: composition and modifier keys are left alone", () => {
		expect(fromEvent(event({ key: "Process", keyCode: 229 }))).toBeNull();
		expect(fromEvent(event({ key: "a", isComposing: true }))).toBeNull();
		for (const key of ["Control", "Shift", "Alt", "Meta", "Dead"]) expect(fromEvent(event({ key }))).toBeNull();
	});

	test("NOTATION-A7: Cmd becomes the engine's M-", () => {
		expect(toEngine(parseKeys("<D-s>"))).toBe("<M-s>");
		expect(toEngine(parseKeys("<C-D-s>"))).toBe("<C-M-s>");
		expect(toEngine(parseKeys("a<lt><Bar><Insert>"))).toBe("a<|<Ins>");
	});

	test("only Ctrl, Alt and Cmd make a chord", () => {
		expect(["<C-a>", "<A-x>", "<D-s>", "<C-S-Tab>"].every(isChord)).toBe(true);
		expect(["a", "A", "<S-Tab>", "<CR>"].some(isChord)).toBe(false);
	});
});
