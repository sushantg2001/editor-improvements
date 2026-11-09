import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { TYPINGS, TYPINGS_FILENAME } from "../../../src/scripts/typings";
import { App, Notice } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

function setup(files: Record<string, string>, enabled = true) {
	const app = new App();
	const registry = new ActionRegistry();
	for (const [name, code] of Object.entries(files)) {
		app.vault.adapter.files.set(`${FOLDER}/${name}`, code);
	}
	app.vault.adapter.dirs.add(FOLDER);

	const host = new ScriptHost({
		app: app as never,
		registry,
		getVim: () => null,
		isEnabled: () => enabled,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	return { host, registry, app };
}

beforeEach(() => {
	Notice.messages.length = 0;
});

describe("ScriptHost.reload", () => {
	it("does nothing when scripts are disabled", async () => {
		const { host, registry } = setup({ "init.js": `vim.action("a", () => {});` }, false);

		const result = await host.reload();

		expect(result.loaded).toEqual([]);
		expect(registry.actions()).toHaveLength(0);
	});

	it("runs init.js and registers what it defines", async () => {
		const { host, registry } = setup({
			"init.js": `vim.action("a", () => {}); vim.nmap("gz", "a");`,
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(registry.get("a")).toBeTruthy();
		expect(registry.bindings()).toHaveLength(1);
	});

	it("runs init.js first, then the rest in lexical order", async () => {
		const { host } = setup({
			"zebra.js": "",
			"alpha.js": "",
			"init.js": "",
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js", "alpha.js", "zebra.js"]);
	});

	it("ignores files that are not .js", async () => {
		const { host } = setup({ "init.js": "", "notes.md": "hello", "a.ts": "" });

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
	});

	it("copes with a folder that does not exist", async () => {
		const { host, app } = setup({});
		app.vault.adapter.dirs.clear();

		await expect(host.reload()).resolves.toMatchObject({ loaded: [], errors: [] });
	});

	it("supports await inside a script", async () => {
		const { host, registry } = setup({
			"init.js": `await Promise.resolve(); vim.action("a", () => {});`,
		});

		await host.reload();

		expect(registry.get("a")).toBeTruthy();
	});
});

describe("ScriptHost error handling", () => {
	it("reports the failing file and keeps the others", async () => {
		const { host, registry } = setup({
			"init.js": `vim.action("good", () => {});`,
			"zbroken.js": `this is not javascript(`,
		});

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.file).toBe("zbroken.js");
		expect(registry.get("good")).toBeTruthy();
	});

	it("surfaces a notice naming the file", async () => {
		const { host } = setup({ "init.js": `throw new Error("kaboom");` });

		await host.reload();

		expect(Notice.messages[0]).toContain("init.js");
		expect(Notice.messages[0]).toContain("kaboom");
	});

	it("leaves nothing behind when a script throws partway through", async () => {
		// Half-applied configuration is worse than none: the user would have
		// to guess which lines took effect.
		const { host, registry } = setup({
			"init.js": `vim.action("a", () => {}); vim.nmap("gz", "a"); throw new Error("late");`,
		});

		await host.reload();

		expect(registry.actions()).toHaveLength(0);
		expect(registry.bindings()).toHaveLength(0);
	});

	it("recovers the line number within the script", async () => {
		const { host } = setup({
			"init.js": `// line 1\n// line 2\nthrow new Error("here");`,
		});

		const result = await host.reload();

		expect(result.errors[0]?.line).toBe(3);
	});
});

describe("ScriptHost teardown", () => {
	it("removes the previous run's actions on reload", async () => {
		const { host, registry, app } = setup({
			"init.js": `vim.action("first", () => {});`,
		});
		await host.reload();
		expect(registry.get("first")).toBeTruthy();

		app.vault.adapter.files.set(
			`${FOLDER}/init.js`,
			`vim.action("second", () => {});`,
		);
		await host.reload();

		expect(registry.get("first")).toBeUndefined();
		expect(registry.get("second")).toBeTruthy();
	});

	it("does not accumulate bindings across reloads", async () => {
		const { host, registry } = setup({ "init.js": `vim.nmap("gz", "x");` });

		await host.reload();
		await host.reload();

		expect(registry.bindings()).toHaveLength(1);
	});

	it("removes a deleted script's registrations", async () => {
		const { host, registry, app } = setup({
			"init.js": `vim.action("a", () => {});`,
			"extra.js": `vim.action("b", () => {});`,
		});
		await host.reload();
		expect(registry.actions()).toHaveLength(2);

		app.vault.adapter.files.delete(`${FOLDER}/extra.js`);
		await host.reload();

		expect(registry.get("a")).toBeTruthy();
		expect(registry.get("b")).toBeUndefined();
	});

	it("clears everything on unload", async () => {
		const { host, registry } = setup({ "init.js": `vim.action("a", () => {});` });
		host.load();
		await host.reload();
		expect(registry.actions()).toHaveLength(1);

		host.unload();

		expect(registry.actions()).toHaveLength(0);
	});
});

describe("ScriptHost.reload when reloads overlap", () => {
	/**
	 * Makes the first read of a file finish late, returning what the file held
	 * when the read started, the way a slow disk or a busy sync folder would.
	 * `started` resolves once that read is under way.
	 */
	function slowFirstRead(app: App) {
		const adapter = app.vault.adapter;
		const original = adapter.read.bind(adapter);
		let release: () => void = () => {};
		let begin: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			begin = resolve;
		});
		let calls = 0;
		adapter.read = async (path: string) => {
			const content = await original(path);
			if (++calls === 1) {
				begin();
				await gate;
			}
			return content;
		};
		return { release, started };
	}

	it("ends with the newest file contents, not whichever reload finished last", async () => {
		const { host, registry, app } = setup({ "init.js": `vim.action("old", () => {});` });
		const slow = slowFirstRead(app);

		const first = host.reload();
		await slow.started;
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.action("fresh", () => {});`);
		const second = host.reload();
		// Late enough that a reload which did not wait would already be done.
		window.setTimeout(slow.release, 20);
		await Promise.all([first, second]);

		expect(registry.has("fresh")).toBe(true);
		expect(registry.has("old")).toBe(false);
	});

	it("gives every caller the result of the final run", async () => {
		const { host, app } = setup({ "init.js": `vim.action("old", () => {});` });
		const slow = slowFirstRead(app);

		const first = host.reload();
		await slow.started;
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `throw new Error("late");`);
		const second = host.reload();
		window.setTimeout(slow.release, 20);
		const [a, b] = await Promise.all([first, second]);

		expect(a).toBe(b);
		// The old version had worked, so the notice also says it stays in effect.
		expect(b.errors.map((e) => e.message.split("\n")[0])).toEqual(["late"]);
	});

	it("collapses a burst of reloads into one more run, not one per call", async () => {
		const { host, app } = setup({ "init.js": "" });
		let reads = 0;
		const adapter = app.vault.adapter;
		const original = adapter.read.bind(adapter);
		adapter.read = async (path: string) => {
			if (path.endsWith("init.js")) {
				reads++;
			}
			return original(path);
		};

		await Promise.all([host.reload(), host.reload(), host.reload(), host.reload()]);

		expect(reads).toBe(2);
	});

	it("can reload again afterwards", async () => {
		const { host, registry, app } = setup({ "init.js": `vim.action("one", () => {});` });

		await host.reload();
		app.vault.adapter.files.set(`${FOLDER}/init.js`, `vim.action("two", () => {});`);
		await host.reload();

		expect(registry.has("two")).toBe(true);
		expect(registry.has("one")).toBe(false);
	});
});

describe("ScriptHost folder watching", () => {
	const settle = () => new Promise((resolve) => window.setTimeout(resolve, 220));

	function watched(files: Record<string, string> = { "init.js": "" }) {
		const t = setup(files);
		const reload = vi.spyOn(t.host, "reload");
		t.host.load();
		reload.mockClear(); // the initial load waits for the layout; ignore it
		const touch = (event: string, path: string, old?: string) =>
			t.app.vault.trigger(event, { path }, old);
		return { ...t, reload, touch };
	}

	it("reloads when a script in the folder is saved", async () => {
		const t = watched();

		t.touch("modify", `${FOLDER}/init.js`);
		await settle();

		expect(t.reload).toHaveBeenCalledOnce();
	});

	it("collapses a burst of saves into one reload", async () => {
		const t = watched();

		t.touch("modify", `${FOLDER}/init.js`);
		t.touch("modify", `${FOLDER}/init.js`);
		t.touch("create", `${FOLDER}/other.js`);
		await settle();

		expect(t.reload).toHaveBeenCalledOnce();
	});

	it("reloads for a script created, deleted or renamed in the folder", async () => {
		for (const event of ["create", "delete"]) {
			const t = watched();
			t.touch(event, `${FOLDER}/new.js`);
			await settle();
			expect(t.reload, event).toHaveBeenCalledOnce();
		}
		const renamed = watched();
		renamed.touch("rename", `${FOLDER}/new.js`, `${FOLDER}/old.js`);
		await settle();
		expect(renamed.reload).toHaveBeenCalledOnce();
	});

	it("reloads when a script is renamed out of the folder", async () => {
		const t = watched();

		t.touch("rename", "notes/init.js", `${FOLDER}/init.js`);
		await settle();

		expect(t.reload).toHaveBeenCalledOnce();
	});

	it("ignores files that are not scripts", async () => {
		const t = watched();

		t.touch("modify", `${FOLDER}/editor-improvements.d.ts`);
		t.touch("modify", `${FOLDER}/notes.md`);
		await settle();

		expect(t.reload).not.toHaveBeenCalled();
	});

	it("ignores a folder that merely starts with the same letters", async () => {
		const t = watched();

		t.touch("modify", `${FOLDER}-backup/init.js`);
		t.touch("modify", `${FOLDER}2/init.js`);
		await settle();

		expect(t.reload).not.toHaveBeenCalled();
	});

	it("does not reload after it has been unloaded", async () => {
		const t = watched();

		t.touch("modify", `${FOLDER}/init.js`);
		t.host.unload();
		await settle();

		expect(t.reload).not.toHaveBeenCalled();
	});
});

describe("ScriptHost typings", () => {
	const TYPINGS_PATH = `${FOLDER}/${TYPINGS_FILENAME}`;

	it("rewrites a stale editor-improvements.d.ts, so an update's new API reaches the editor", async () => {
		const { host, app } = setup({ "init.js": "", [TYPINGS_FILENAME]: "// from an older version" });

		await host.reload();

		expect(app.vault.adapter.files.get(TYPINGS_PATH)).toBe(TYPINGS);
	});

	it("creates it when the folder exists without one", async () => {
		const { host, app } = setup({ "init.js": "" });

		await host.reload();

		expect(app.vault.adapter.files.get(TYPINGS_PATH)).toBe(TYPINGS);
	});

	it("leaves a current one untouched", async () => {
		const { host, app } = setup({ "init.js": "", [TYPINGS_FILENAME]: TYPINGS });
		const write = vi.spyOn(app.vault.adapter, "write");

		await host.reload();

		expect(write).not.toHaveBeenCalled();
	});

	it("does not create the folder, or write anything, while scripts are off", async () => {
		const { host, app } = setup({}, false);
		app.vault.adapter.dirs.clear();

		await host.reload();

		expect(app.vault.adapter.files.has(TYPINGS_PATH)).toBe(false);
		expect(await app.vault.adapter.exists(FOLDER)).toBe(false);
	});

	it("does not create the folder when scripts are on but there is none", async () => {
		const { host, app } = setup({});
		app.vault.adapter.dirs.clear();

		await host.reload();

		expect(await app.vault.adapter.exists(FOLDER)).toBe(false);
	});

	it("never runs the typings file as a script", async () => {
		const { host } = setup({ "init.js": "", [TYPINGS_FILENAME]: TYPINGS });

		const result = await host.reload();

		expect(result.loaded).toEqual(["init.js"]);
		expect(result.errors).toEqual([]);
	});

	it("still loads scripts when the typings cannot be written", async () => {
		const { host, app, registry } = setup({ "init.js": `vim.action("a", () => {});` });
		app.vault.adapter.write = async () => {
			throw new Error("read-only");
		};

		const result = await host.reload();

		expect(result.errors).toEqual([]);
		expect(registry.has("a")).toBe(true);
	});
});
