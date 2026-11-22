import type { Check } from "../harness";

const pop = "(app.keymap.popScope(window.__s), true)";

export default {
	name: "scope-results",
	covers: ["V1", "V2"],
	async run(t) {
		await t.openNote("spec.md");
		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");
		await t.hotkey();
		t.expect(await t.log(), "no scope").toEqual(["cmd:hk"]);

		await t.eval(`(window.__s = window.__scope(() => { window.__log.push("scope"); return undefined; }), true)`);
		await t.hotkey();
		t.expect(await t.log(), "undefined continues to the parent").toEqual(["scope", "cmd:hk"]);
		await t.eval(pop);

		await t.eval(`(window.__s = window.__scope(() => { window.__log.push("scope"); return true; }), true)`);
		await t.hotkey();
		t.expect(await t.log(), "true stops the chain").toEqual(["scope"]);
		await t.pressKeys("i", "Z", "<Esc>");
		t.expect(await t.lineText(0), "true does not cancel, so vim gets the keys").toBe("ZLine one alpha");
		await t.eval(pop);
		await t.log();

		await t.eval(`(window.__s = window.__scope(() => { window.__log.push("scope"); return false; }), true)`);
		await t.press("i");
		t.expect(await t.vimMode(), "false cancels the key").toBe("normal");
		t.expect(await t.log(), "false stops the chain").toEqual(["scope"]);
		await t.eval(pop);

		await t.hotkey();
		t.expect(await t.log(), "after the scope is gone").toEqual(["cmd:hk"]);
	},
} satisfies Check;
