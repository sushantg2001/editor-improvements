import { describe, expect, it } from "vitest";

import { validateContribution } from "../../../src/core/validate";
import type { BindingContext } from "../../../src/types";

const binding = (keys: string, contexts: BindingContext[] = ["normal"]) => ({
	bindings: [{ keys, contexts, target: { kind: "keys" as const, rhs: "x", recursive: true } }],
});

describe("a left-hand side that starts with a colon", () => {
	it.each([":x", ":write", ":nohl"])("is refused when it is %s, with what to do instead", (keys) => {
		const problems = validateContribution(binding(keys));

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(`"${keys}"`);
		expect(problems[0]).toMatch(/ex command/);
		expect(problems[0]).toMatch(/vim\.action/);
	});

	it("is refused in every context", () => {
		expect(validateContribution(binding(":x", ["normal", "visual", "insert", "operatorPending"]))).toHaveLength(1);
	});

	it("is fine as a longer key sequence that merely contains a colon", () => {
		expect(validateContribution(binding("g:"))).toEqual([]);
		expect(validateContribution(binding("a:b"))).toEqual([]);
	});

	it("is fine on its own, which is the key that opens the command line", () => {
		expect(validateContribution(binding(":"))).toEqual([]);
	});

	it("does not stop a right-hand side from being an ex command", () => {
		const ok = { bindings: [{ keys: "zz", contexts: ["normal" as const], target: { kind: "keys" as const, rhs: ":w<CR>", recursive: false } }] };

		expect(validateContribution(ok)).toEqual([]);
	});
});
