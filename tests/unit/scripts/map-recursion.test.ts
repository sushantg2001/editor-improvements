import { describe, expect, it } from "vitest";

import { createScriptApi } from "../../../src/scripts/api";
import { App } from "../../mocks/obsidian";

function declare(use: (vim: ReturnType<typeof createScriptApi>["api"]) => void) {
	const { api, contribution } = createScriptApi({
		app: new App() as never,
		getVim: () => null,
		leader: "\\",
		knowsAction: () => false,
	});
	use(api);
	return contribution.bindings ?? [];
}

describe("which mapping calls are recursive", () => {
	it.each(["map", "nmap", "vmap", "imap", "omap"] as const)("%s is, as in vim", (name) => {
		const [binding] = declare((vim) => vim[name]("a", "b"));

		expect(binding?.target).toMatchObject({ kind: "keys", recursive: true });
	});

	it.each(["noremap", "nnoremap", "vnoremap", "inoremap", "onoremap"] as const)(
		"%s is not",
		(name) => {
			const [binding] = declare((vim) => vim[name]("a", "b"));

			expect(binding?.target).toMatchObject({ kind: "keys", recursive: false });
		},
	);

	it.each([
		["nmap", ["normal"]],
		["vmap", ["visual"]],
		["imap", ["insert"]],
		["omap", ["operatorPending"]],
		["nnoremap", ["normal"]],
		["vnoremap", ["visual"]],
		["inoremap", ["insert"]],
		["onoremap", ["operatorPending"]],
	] as const)("%s covers only its own mode", (name, contexts) => {
		const [binding] = declare((vim) => vim[name]("a", "b"));

		expect(binding?.contexts).toEqual(contexts);
	});
});
