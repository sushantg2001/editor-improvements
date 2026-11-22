import type { Check } from "../harness";

const onTop = "app.keymap.getWindowStack(window.__popout.getContainer().win).scope === window.__R.scope";

export default {
	name: "popout-router",
	covers: ["V19"],
	async run(t) {
		await t.openNote("spec.md");
		await t.installRouter();
		await t.eval("(window.__R.takeover(), true)");
		await t.eval(`(() => {
			const R = window.__R;
			R.maps.set("global C-A-u", () => {});
			R.ref = app.workspace.on("window-open", (_, win) => setTimeout(() => R.install(win), 0));
			return true;
		})()`);
		t.cleanup(() => t.eval("(app.workspace.offref(window.__R.ref), true)"));
		const popout = await t.openPopout("spec.md");
		t.expect(await t.eval(onTop), "installed on the next task, the router is on top").toBe(true);

		await t.eval("window.__R.log.splice(0)");
		await t.press("<C-A-u>", { page: popout });
		t.expect(await t.eval("window.__R.log.splice(0)"), "a mapped key works").toEqual(["mapped editor C-A-u"]);
		await t.press("i", { page: popout });
		await t.press("<Esc>", { page: popout });
		t.expect(await t.eval("window.__R.log.splice(0)"), "engine keys fall through").toEqual(["fallthrough editor i", "fallthrough editor Escape"]);

		await popout.eval(`(app.commands.executeCommandById("command-palette:open"), true)`);
		await t.sleep(500);
		t.expect(await popout.eval(`!!document.querySelector(".prompt")`), "the palette opens in the popout").toBe(true);
		t.expect(await t.eval(onTop), "the router stays on top").toBe(true);
		await t.press("a", { page: popout });
		t.expect(await popout.eval(`document.querySelector(".prompt-input").value`), "the palette keeps its keys").toBe("a");
		await t.press("<Esc>", { page: popout });
		await t.sleep(300);
		t.expect(await popout.eval(`!document.querySelector(".prompt")`), "Escape closes it").toBe(true);
	},
} satisfies Check;
