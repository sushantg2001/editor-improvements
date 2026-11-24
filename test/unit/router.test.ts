import { beforeEach, describe, expect, test } from "bun:test";
import type { ActionResult, Classified } from "../../src/actions/registry";
import type { Engine } from "../../src/engine/engine";
import { contextChain } from "../../src/router/classify";
import { KeyRouter } from "../../src/router/dispatch";
import { PANIC_CHORD, type RouterMapping } from "../../src/router/router";
import { ErrorBudget } from "../../src/lifecycle/error-budget";
import { Changes } from "../../src/lifecycle/changes";

const map = (context: string, keys: string[], action: string, repeatable = true): RouterMapping => ({ context, keys, action, repeatable });

function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
	const target = document.createElement("div");
	document.body.append(target);
	return { key, code: "", keyCode: 0, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, repeat: false, target, getModifierState: () => false, ...mods } as unknown as KeyboardEvent;
}

describe("key router", () => {
	let ran: string[];
	let delivered: string[];
	let panics: number;
	let errors: number;
	let result: ActionResult | "throw";
	let router: KeyRouter;

	beforeEach(() => {
		ran = [];
		delivered = [];
		panics = 0;
		errors = 0;
		result = "handled";
		router = new KeyRouter({
			engine: { isAttached: () => false, mode: () => "n", deliverKey: (_: unknown, key: string) => delivered.push(key) } as unknown as Engine,
			actions: {
				run: (id: string) => {
					if (result === "throw") throw new Error("boom");
					ran.push(id);
					return result;
				},
			},
			mac: false,
			workspaceBelow: () => true,
			activeViewType: () => null,
			onPanic: () => panics++,
			onError: () => errors++,
			onChange: () => {},
		});
	});

	test("a mapped key runs and is cancelled", () => {
		router.setKeymap([map("global", ["<C-p>"], "a")], 1000, true);
		expect(router.handle(keyEvent("p", { ctrlKey: true }))).toBe(false);
		expect(ran).toEqual(["a"]);
	});

	test("ROUTER-A5: strict keys swallow an unmapped chord, and only then", () => {
		router.setKeymap([], 1000, true);
		expect(router.handle(keyEvent("k", { ctrlKey: true }))).toBe(false);
		expect(router.handle(keyEvent("k"))).toBeUndefined();
		router.setKeymap([], 1000, false);
		expect(router.handle(keyEvent("k", { ctrlKey: true }))).toBeUndefined();
	});

	test("ROUTER-A8: a key that breaks a sequence runs what was held, then carries on", () => {
		router.setKeymap([map("global", ["g", "t"], "gt"), map("global", ["g", "t", "t"], "gtt")], 20, true);
		expect(router.handle(keyEvent("g"))).toBe(false);
		expect(router.handle(keyEvent("t"))).toBe(false);
		expect(ran).toEqual([]);
		expect(router.pending).toEqual(["g", "t"]);
		expect(router.handle(keyEvent("x"))).toBeUndefined();
		expect(ran).toEqual(["gt"]);
		expect(router.pending).toBeNull();
	});

	test("ROUTER-A8: a complete mapping that is also a prefix runs after the timeout", async () => {
		router.setKeymap([map("global", ["g", "t"], "gt"), map("global", ["g", "t", "t"], "gtt")], 10, true);
		router.handle(keyEvent("g"));
		router.handle(keyEvent("t"));
		await Bun.sleep(40);
		expect(ran).toEqual(["gt"]);
		expect(router.pending).toBeNull();
	});

	test("a longer sequence wins over its prefix", () => {
		router.setKeymap([map("global", ["g", "t"], "gt"), map("global", ["g", "t", "t"], "gtt")], 1000, true);
		for (const key of ["g", "t", "t"]) router.handle(keyEvent(key));
		expect(ran).toEqual(["gtt"]);
	});

	test("ROUTER-A9: a repeated key runs only a repeatable action", () => {
		router.setKeymap([map("global", ["a"], "once", false), map("global", ["b"], "many", true)], 1000, true);
		expect(router.handle(keyEvent("a", { repeat: true }))).toBe(false);
		expect(ran).toEqual([]);
		router.handle(keyEvent("b", { repeat: true }));
		expect(ran).toEqual(["many"]);
	});

	test("an action that does not apply passes the key on", () => {
		router.setKeymap([map("global", ["a"], "x")], 1000, true);
		result = "not-applicable";
		expect(router.handle(keyEvent("a"))).toBeUndefined();
	});

	test("ROUTER-R7: the panic chord works in safe mode, which passes everything else", () => {
		router.setKeymap([map("global", ["a"], "x")], 1000, true);
		router.setSafeMode(true);
		expect(router.handle(keyEvent("a"))).toBeUndefined();
		expect(ran).toEqual([]);
		expect(PANIC_CHORD).toBe("<C-A-S-F12>");
		expect(router.handle(keyEvent("F12", { ctrlKey: true, altKey: true, shiftKey: true }))).toBe(false);
		expect(panics).toBe(1);
	});

	test("ROUTER-R11: nothing escapes the handler", () => {
		router.setKeymap([map("global", ["a"], "x")], 1000, true);
		result = "throw";
		expect(router.handle(keyEvent("a"))).toBeUndefined();
		expect(errors).toBe(1);
	});

	test("ROUTER-R12: lookup goes from the most specific context", () => {
		const editor = { context: "editor", mode: "x", win: window } as unknown as Classified;
		expect(contextChain(editor)).toEqual(["editor:x", "editor:v", "editor", "global"]);
		expect(contextChain({ context: "modal", win: window } as unknown as Classified)).toEqual(["modal", "transient", "global"]);
		expect(contextChain({ context: "view:graph", win: window } as unknown as Classified)).toEqual(["view:graph", "global"]);
	});
});

describe("safety", () => {
	test("LIFE-R7: more than five errors in ten seconds spends the budget", () => {
		const budget = new ErrorBudget();
		for (let i = 0; i < 5; i++) expect(budget.record(1000 + i)).toBe(false);
		expect(budget.record(1005)).toBe(true);
		const spaced = new ErrorBudget();
		for (let i = 0; i < 10; i++) expect(spaced.record(i * 11_000)).toBe(false);
	});

	test("LIFE-A3: undo runs newest first, and a failure stops nothing", () => {
		const order: number[] = [];
		const changes = new Changes();
		changes.add("one", () => order.push(1));
		changes.add("two", () => {
			order.push(2);
			throw new Error("boom");
		});
		changes.add("three", () => order.push(3));
		const consoleError = console.error;
		console.error = () => {};
		changes.undoAll();
		console.error = consoleError;
		expect(order).toEqual([3, 2, 1]);
	});
});
