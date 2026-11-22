import type { Check } from "../harness";

export default {
	name: "popout-stacks",
	covers: ["V8"],
	async run(t) {
		await t.openNote("spec.md");
		await t.eval(`(window.__ref = app.workspace.on("window-open", () => window.__log.push("main active: " + (activeWindow === window))), true)`);
		t.cleanup(() => t.eval("(app.workspace.offref(window.__ref), true)"));
		await t.openPopout("spec.md");
		t.expect(await t.log(), "window-open fires while the main window is active").toContain("main active: true");
		const separate = await t.eval(`app.keymap.getWindowStack(window.__popout.getContainer().win) !== app.keymap.getWindowStack(window)`);
		t.expect(separate, "a popout has its own scope stack").toBe(true);
	},
} satisfies Check;
