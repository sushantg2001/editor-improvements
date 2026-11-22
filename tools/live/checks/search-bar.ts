import type { Check } from "../harness";

const stack = `(() => {
	const st = app.keymap.getWindowStack(window);
	return { routerOnTop: st.scope === window.__R.scope, workspaceBelow: st.prevScopes[st.prevScopes.length - 1] === app.workspace.scope };
})()`;

export default {
	name: "search-bar",
	covers: ["V21"],
	async run(t) {
		await t.openNote("spec.md");
		await t.installRouter();
		await t.eval("(window.__R.takeover(), true)");
		await t.eval(`(app.commands.executeCommandById("editor:open-search"), true)`);
		await t.sleep(400);
		t.expect(await t.eval(stack), "the search bar pushes no scope").toEqual({ routerOnTop: true, workspaceBelow: true });
		t.expect(await t.eval("window.__R.context({ view: window, target: document.activeElement })"), "its input classifies").toBe("input");
		await t.pressKeys("b", "e", "t", "a");
		t.expect(await t.eval("document.activeElement.value"), "typing works").toBe("beta");
		await t.press("<Esc>");
		await t.sleep(300);
		const closed = await t.eval(`(() => {
			const bar = document.querySelector(".document-search-container");
			return !bar || getComputedStyle(bar).display === "none";
		})()`);
		t.expect(closed, "Escape closes it").toBe(true);
	},
} satisfies Check;
