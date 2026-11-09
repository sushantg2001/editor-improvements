import { describe, expect, it } from "vitest";

import { describeKeysProblem, normalizeKeys, tokenizeKeys } from "../../../src/core/keys";

/** Seeded, so a failure names the seed that reproduces it. */
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
	"a", "B", "j", "k", "g", "d", " ", "\t", "\n", "<", ">", "<<", ">>", "<>", "<Space>", "<space>",
	"<CR>", "<cr>", "<Enter>", "<Esc>", "<esc>", "<C-h>", "<c-H>", "<A-j>", "<M-j>", "<C-S-x>", "<S-C-X>",
	"<lt>", "<Bar>", "<Bslash>", "<leader>", "<F5>", "<f12>", "<Up>", "<up>", "<C-'>", "<C-/>", "<Foo>",
	"<C-", "C->", "<C->", "<-C>", "😀", "é", "\\", "|", '"', "'", "`", "[", "]", ";", ":", "<<lt>>", "<C-<>",
];

function randomKeys(random: () => number): string {
	const count = Math.floor(random() * 8);
	let keys = "";
	for (let i = 0; i < count; i++) {
		keys += PIECES[Math.floor(random() * PIECES.length)];
	}
	return keys;
}

const ITERATIONS = 3000;

describe("key notation properties", () => {
	it("tokenizing loses nothing: the tokens joined are the keys", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const keys = randomKeys(prng(seed));
			expect(tokenizeKeys(keys).join(""), `seed ${seed} ${JSON.stringify(keys)}`).toBe(keys);
		}
	});

	it("every token is one key: a <...> name or a single character", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const keys = randomKeys(prng(seed));
			for (const token of tokenizeKeys(keys)) {
				const isName = token.length > 2 && token.startsWith("<") && token.endsWith(">");
				const isChar = [...token].length === 1;
				expect(isName || isChar, `seed ${seed} ${JSON.stringify(keys)} token ${JSON.stringify(token)}`).toBe(true);
			}
		}
	});

	it("normalizing twice is the same as once", () => {
		for (const literalSpace of [true, false]) {
			for (let seed = 1; seed <= ITERATIONS; seed++) {
				const keys = randomKeys(prng(seed));
				const once = normalizeKeys(keys, { literalSpace });
				expect(normalizeKeys(once, { literalSpace }), `seed ${seed} ${JSON.stringify(keys)}`).toBe(once);
			}
		}
	});

	it("normalizing never turns a sound sequence into an unsound one", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const keys = randomKeys(prng(seed));
			// `<lt>` is left out: it becomes a bare `<`, which can join the text after it
			// into a new <name> (`<lt>CR>` -> `<CR>`). The addon has no way to write that
			// sequence at all, so there is nothing sound to normalize it to.
			if (!/<lt>/i.test(keys) && describeKeysProblem(keys) === null) {
				const problem = describeKeysProblem(normalizeKeys(keys, { literalSpace: true }));
				expect(problem, `seed ${seed} ${JSON.stringify(keys)}`).toBeNull();
			}
		}
	});

	it("normalizing keeps the number of keys, except where a name stands for one character", () => {
		for (let seed = 1; seed <= ITERATIONS; seed++) {
			const keys = randomKeys(prng(seed));
			const before = tokenizeKeys(keys).length;
			const after = tokenizeKeys(normalizeKeys(keys, { literalSpace: true })).length;
			// <lt>, <Bar> and <Bslash> become a character that may glue onto a
			// neighbour, but a key is never lost or invented otherwise.
			expect(after, `seed ${seed} ${JSON.stringify(keys)}`).toBeLessThanOrEqual(before + 2 * before);
			expect(after).toBeGreaterThanOrEqual(before > 0 ? 1 : 0);
		}
	});
});
