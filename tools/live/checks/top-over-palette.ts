import type { Check } from "../harness";

const stack = `(() => {
	const st = app.keymap.getWindowStack(window);
	const below = st.prevScopes[st.prevScopes.length - 1];
	return {
		top: st.scope === window.__R.scope,
		parentIsBelow: window.__R.scope.parent === below,
		belowIsWorkspace: below === app.workspace.scope,
		copies: st.prevScopes.filter((scope) => scope === window.__R.scope).length,
	};
})()`;

export default {
	name: "top-over-palette",
	covers: ["V4"],
	async run(t) {
		await t.openNote("spec.md");
		await t.installRouter();
		for (let round = 0; round < 2; round++) {
			await t.eval(`(app.commands.executeCommandById("command-palette:open"), true)`);
			await t.sleep(400);
			t.expect(await t.eval(stack), "palette open").toEqual({ top: true, parentIsBelow: true, belowIsWorkspace: false, copies: 0 });
			await t.pressKeys("a", "b", "c");
			t.expect(await t.eval(`document.querySelector(".prompt-input").value`), "typing reaches the palette").toBe("abc");
			await t.press("<Esc>");
			await t.sleep(300);
			t.expect(await t.eval(`!document.querySelector(".prompt")`), "Escape closes the palette").toBe(true);
			t.expect(await t.eval(stack), "palette closed").toEqual({ top: true, parentIsBelow: true, belowIsWorkspace: true, copies: 0 });
		}
	},
} satisfies Check;
