import type { Check } from "../harness";

export default {
	name: "modal-scope",
	covers: ["V11"],
	async run(t) {
		await t.openNote("spec.md");
		await t.eval(`(window.__ours = window.__scope(() => { window.__log.push("ours"); return undefined; }), true)`);
		t.cleanup(() => t.eval("(app.keymap.popScope(window.__ours), true)"));
		await t.eval(`(app.commands.executeCommandById("command-palette:open"), true)`);
		await t.sleep(400);
		const open = await t.eval(`(() => {
			const st = app.keymap.getWindowStack(window);
			return { covered: st.scope !== window.__ours, noParent: st.scope.parent == null, oursBelow: st.prevScopes[st.prevScopes.length - 1] === window.__ours };
		})()`);
		t.expect(open, "the palette pushes a parentless scope").toEqual({ covered: true, noParent: true, oursBelow: true });
		await t.hotkey();
		t.expect(await t.log(), "a key in the palette never reaches the scope below").toEqual([]);
		await t.press("<Esc>");
		await t.sleep(300);
		t.expect(await t.eval("app.keymap.getWindowStack(window).scope === window.__ours"), "closing pops it").toBe(true);
	},
} satisfies Check;
