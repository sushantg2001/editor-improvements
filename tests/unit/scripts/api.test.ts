import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScriptApi, expandLeader } from "../../../src/scripts/api";
import { ActionRegistry } from "../../../src/core/registry";
import { App, Notice } from "../../mocks/obsidian";
import type { VimApi } from "../../../src/types";

function setup(vim: Partial<VimApi> | null = {}, known: string[] = []) {
	const registry = new ActionRegistry();
	const app = new App();
	const { api, contribution } = createScriptApi({
		app: app as never,
		getVim: () => (vim ? (vim as VimApi) : null),
		leader: "\\",
		knowsAction: (id) => known.includes(id),
	});
	return {
		api,
		registry,
		app,
		/** Bindings accumulated so far; the contribution is built in place. */
		get bindings() {
			return contribution.bindings ?? [];
		},
		get actions() {
			return contribution.actions ?? [];
		},
		get unmaps() {
			return contribution.unmaps ?? [];
		},
	};
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("expandLeader", () => {
	it("replaces every occurrence, case-insensitively", () => {
		expect(expandLeader("<leader>a<Leader>b", " ")).toBe(" a b");
	});

	it("leaves keys without a leader alone", () => {
		expect(expandLeader("gx", " ")).toBe("gx");
	});
});

describe("defining actions", () => {
	it("collects the action into the contribution", () => {
		const { api, actions } = setup();
		api.action("my.thing", () => {});

		expect(actions[0]).toMatchObject({ id: "my.thing", kind: "action" });
	});

	it("registers motions and operators with the right kind", () => {
		const { api, actions } = setup();
		api.motion("m", () => undefined);
		api.operator("o", () => undefined);

		expect(actions.map((a) => a.kind)).toEqual(["motion", "operator"]);
	});

	it("defaults the display name to the id and the group to Scripts", () => {
		const { api, actions } = setup();
		api.action("a", () => {});

		expect(actions[0]).toMatchObject({ name: "a", group: "Scripts" });
	});

	it("carries options through", () => {
		const { api, actions } = setup();
		api.action("a", () => {}, {
			name: "Nice name",
			needsEditor: false,
			resultMode: "insert",
			command: false,
		});

		expect(actions[0]).toMatchObject({
			name: "Nice name",
			needsEditor: false,
			resultMode: "insert",
			command: false,
		});
	});

	it("passes isEdit through, so a script action can be repeated with a dot", () => {
		const { api, actions } = setup();

		api.action("trim", () => {}, { isEdit: true });
		api.action("peek", () => {});

		expect(actions[0]?.isEdit).toBe(true);
		expect(actions[1]?.isEdit).toBeUndefined();
	});

	it("rejects an empty id rather than registering something unreachable", () => {
		const { api } = setup();
		expect(() => api.action("", () => {})).toThrow(/id/);
	});
});

describe("mapping", () => {
	it("binds to an action when the right-hand side names one", () => {
		const { api, bindings } = setup();
		api.action("my.thing", () => {});
		api.nmap("gz", "my.thing");

		expect(bindings[0]).toMatchObject({
			keys: "gz",
			contexts: ["normal"],
			target: { kind: "action", id: "my.thing" },
		});
	});

	it("carries the action's kind so motions still compose", () => {
		const { api, bindings } = setup();
		api.motion("m", () => undefined);
		api.nmap("gz", "m");

		expect(bindings[0]?.target).toMatchObject({ kind: "action", actionKind: "motion" });
	});

	it("falls back to a plain vim remap for anything else", () => {
		const { api, bindings } = setup();
		api.nnoremap("H", "^");

		expect(bindings[0]?.target).toEqual({ kind: "keys", rhs: "^", recursive: false });
	});

	it("distinguishes recursive from non-recursive maps", () => {
		const { api, bindings } = setup();
		api.nmap("a", "b");
		api.nnoremap("c", "d");

		expect(bindings[0]?.target).toMatchObject({ recursive: true });
		expect(bindings[1]?.target).toMatchObject({ recursive: false });
	});

	it("maps each family to its vim context", () => {
		const { api, bindings } = setup();
		api.nmap("a", "x");
		api.vmap("b", "x");
		api.imap("c", "x");
		api.omap("d", "x");

		expect(bindings.map((b) => b.contexts[0])).toEqual([
			"normal",
			"visual",
			"insert",
			"operatorPending",
		]);
	});

	it("expands <leader> using the value set at map time", () => {
		const { api, bindings } = setup();
		api.leader(" ");
		api.nmap("<leader>d", "x");
		api.leader(",");
		api.nmap("<leader>f", "x");

		expect(bindings[0]?.keys).toBe(" d");
		expect(bindings[1]?.keys).toBe(",f");
	});

	it("expands <leader> on the right-hand side of a remap too", () => {
		const { api, bindings } = setup();
		api.leader(" ");
		api.nnoremap("x", "<leader>y");

		expect(bindings[0]?.target).toMatchObject({ rhs: " y" });
	});

	it("bind() targets an action id without guessing", () => {
		const { api, bindings } = setup();
		api.bind("gz", "not.registered.yet");

		expect(bindings[0]?.target).toMatchObject({
			kind: "action",
			id: "not.registered.yet",
		});
	});

	it("resolves a right-hand side defined by an earlier source", () => {
		// `knowsAction` is how a later script can map to something init.js
		// declared, even though nothing has been applied yet.
		const { api, bindings } = setup({}, ["fromEarlier"]);
		api.nmap("gz", "fromEarlier");

		expect(bindings[0]?.target).toMatchObject({
			kind: "action",
			id: "fromEarlier",
		});
	});
});

describe("set", () => {
	it("forwards to the vim API", () => {
		const setOption = vi.fn();
		const { api } = setup({ setOption });

		api.set("textwidth", 80);

		expect(setOption).toHaveBeenCalledWith("textwidth", 80);
	});

	it("explains itself when vim mode is off, rather than failing silently", () => {
		const { api } = setup(null);
		expect(() => api.set("textwidth", 80)).toThrow(/vim mode is not active/);
	});
});

describe("obcommand", () => {
	it("runs the command and reports success", () => {
		const { api, app } = setup();
		const executeCommandById = vi.fn(() => true);
		(app as unknown as { commands: unknown }).commands = { executeCommandById };

		expect(api.obcommand("editor:toggle-bold")).toBe(true);
		expect(executeCommandById).toHaveBeenCalledWith("editor:toggle-bold");
	});

	it("throws on an unknown command so the script author sees the typo", () => {
		const { api, app } = setup();
		(app as unknown as { commands: unknown }).commands = {
			executeCommandById: () => false,
		};

		expect(() => api.obcommand("nope:nope")).toThrow(/not be found|not found/);
	});
});

describe("unmap", () => {
	it("records the keys to free, in every context unless told otherwise", () => {
		const t = setup();

		t.api.unmap(",");

		expect(t.unmaps).toEqual([{ keys: ",", contexts: undefined }]);
	});

	it("takes the contexts it is given", () => {
		const t = setup();

		t.api.unmap("S", ["normal", "visual"]);

		expect(t.unmaps).toEqual([{ keys: "S", contexts: ["normal", "visual"] }]);
	});

	it.each([
		["nunmap", "normal"],
		["vunmap", "visual"],
		["iunmap", "insert"],
		["ounmap", "operatorPending"],
	] as const)("%s frees the key in %s only", (name, context) => {
		const t = setup();

		t.api[name]("S");

		expect(t.unmaps).toEqual([{ keys: "S", contexts: [context] }]);
	});

	it("expands the leader like a mapping does", () => {
		const t = setup();
		t.api.leader(" ");

		t.api.nunmap("<leader>");

		expect(t.unmaps[0]?.keys).toBe(" ");
	});

	it("applies nothing by itself", () => {
		const vim = { unmap: vi.fn() };
		const t = setup(vim);

		t.api.nunmap("S");

		expect(vim.unmap).not.toHaveBeenCalled();
	});
});
