import { describe, expect, it } from "vitest";

import { validateContribution } from "../../../src/core/validate";
import type { VimActionDef } from "../../../src/types";

function action(extra: Partial<VimActionDef> = {}): VimActionDef {
	return {
		id: "doThing",
		name: "Do thing",
		group: "Editing",
		kind: "action",
		run: () => {},
		...extra,
	};
}

describe("validateContribution", () => {
	it("accepts a well-formed contribution", () => {
		const problems = validateContribution({
			actions: [action({ defaultKeys: [{ keys: "gz", contexts: ["normal"] }] })],
			bindings: [
				{
					keys: "H",
					contexts: ["normal", "visual"],
					target: { kind: "keys", rhs: "^", recursive: false },
				},
			],
		});

		expect(problems).toEqual([]);
	});

	it("accepts an empty contribution", () => {
		expect(validateContribution({})).toEqual([]);
	});

	it.each(["", "1abc", "has space", "a.b"])("rejects the id %j", (id) => {
		expect(validateContribution({ actions: [action({ id })] })[0]).toMatch(/ids start with/);
	});

	it.each(["reload-config", "show-status", "create-scripts-folder"])(
		"rejects %s, the id of one of the plugin's own commands",
		(id) => {
			const problems = validateContribution({ actions: [action({ id })] });

			expect(problems).toHaveLength(1);
			expect(problems[0]).toMatch(/belongs to a command of the plugin/);
		},
	);

	it("allows a reserved id for an action that registers no command", () => {
		expect(validateContribution({ actions: [action({ id: "reload-config", command: false })] })).toEqual([]);
	});

	it("rejects a duplicated id within one source", () => {
		const problems = validateContribution({ actions: [action(), action()] });

		expect(problems).toEqual(['action "doThing": defined more than once']);
	});

	it("requires a palette name", () => {
		expect(validateContribution({ actions: [action({ name: "  " })] })[0]).toMatch(
			/needs a name/,
		);
	});

	it("requires a group, but not any particular spelling of it", () => {
		expect(validateContribution({ actions: [action({ group: " " })] })[0]).toMatch(/needs a group/);
		expect(validateContribution({ actions: [action({ group: "my notes" })] })).toEqual([]);
	});

	it("rejects an unknown kind and a non-function run", () => {
		const problems = validateContribution({
			actions: [action({ kind: "macro" as never, run: "nope" as never })],
		});

		expect(problems).toHaveLength(2);
	});

	it("checks the keys of default bindings and of free bindings", () => {
		const problems = validateContribution({
			actions: [action({ defaultKeys: [{ keys: "<Escape>", contexts: ["normal"] }] })],
			bindings: [
				{ keys: "", contexts: ["normal"], target: { kind: "keys", rhs: "x", recursive: true } },
			],
		});

		expect(problems).toHaveLength(2);
		expect(problems[0]).toMatch(/not a vim key name/);
		expect(problems[1]).toMatch(/empty/);
	});

	it("rejects a binding with no context or an unknown one", () => {
		const problems = validateContribution({
			bindings: [
				{ keys: "a", contexts: [], target: { kind: "keys", rhs: "b", recursive: true } },
				{
					keys: "c",
					contexts: ["command" as never],
					target: { kind: "keys", rhs: "d", recursive: true },
				},
			],
		});

		expect(problems).toEqual([
			'binding "a": no context to bind in',
			'binding "c": unknown context "command"',
		]);
	});

	it("rejects a remap to nothing", () => {
		const problems = validateContribution({
			bindings: [
				{ keys: "a", contexts: ["normal"], target: { kind: "keys", rhs: "", recursive: false } },
			],
		});

		expect(problems).toEqual(['binding "a": the right-hand side is empty']);
	});
});

describe("validateContribution unmaps", () => {
	it("accepts valid keys", () => {
		expect(validateContribution({ unmaps: [{ keys: "S" }, { keys: "<Space>", contexts: ["normal"] }] })).toEqual([]);
	});

	it("rejects a misspelt or empty one", () => {
		const problems = validateContribution({ unmaps: [{ keys: "<Escape>" }, { keys: "" }] });

		expect(problems).toHaveLength(2);
		expect(problems[0]).toMatch(/^unmap "<Escape>"/);
	});
});
