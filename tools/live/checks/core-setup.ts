import type { Check } from "../harness";
import { PLUGIN_ID } from "../launch";

const id = JSON.stringify(PLUGIN_ID);
const snapshot = `(() => {
	const stack = app.keymap.getWindowStack(window);
	return {
		vim: app.vault.getConfig("vimMode"),
		hotkeys: app.scope.keys.filter((k) => k.key === null && k.modifiers === null).length,
		topIsWorkspace: stack.scope === app.workspace.scope,
		patched: Object.hasOwn(app.keymap, "pushScope") || Object.hasOwn(app.keymap, "popScope"),
	};
})()`;

export default {
	name: "core-setup",
	covers: ["LIFE-A2", "ENGINE-A1", "ENGINE-A2", "CONFIG-A6", "ROUTER-A2"],
	async run(t) {
		await t.openNote("spec.md");
		const before = await t.eval(snapshot);

		// A first run asks, and "Not now" changes nothing.
		await t.eval(`(async () => {
			localStorage.removeItem("editor-improvements:" + app.appId + ":setup");
			await app.plugins.disablePlugin(${id});
			await app.plugins.enablePlugin(${id});
			return true;
		})()`);
		t.cleanup(() => t.eval(`(document.querySelectorAll(".modal-close-button").forEach((b) => b.click()), localStorage.setItem("editor-improvements:" + app.appId + ":setup", JSON.stringify("declined")), true)`));
		await t.waitFor(`!!document.querySelector(".modal-title")?.textContent.includes("Set up")`);
		await t.eval(`([...document.querySelectorAll(".modal button")].find((b) => b.textContent === "Not now").click(), true)`);
		await t.sleep(150);
		t.expect(await t.pluginState(), "declined").toBe("inactive");
		t.expect(await t.eval(`app.vault.adapter.exists(app.vault.configDir + "/editor-improvements")`), "nothing is written before you agree").toBe(false);
		t.expect(await t.eval(snapshot), "declining changes nothing").toEqual(before);

		await t.activatePlugin(`vim.keymap.set("n", "Z", "dd")`);
		t.expect(await t.pluginState(), "after setup").toBe("active");
		const during = await t.eval<{ vim: boolean; hotkeys: number; topIsWorkspace: boolean }>(snapshot);
		t.expect([during.vim, during.hotkeys, during.topIsWorkspace], "vim off, hotkeys off, router on top").toEqual([false, 0, false]);
		await t.openNote("spec.md");
		await t.hotkey();
		t.expect(await t.log(), "native hotkeys are off").toEqual([]);

		await t.eval(`app.plugins.disablePlugin(${id})`);
		t.expect(await t.eval(snapshot), "unload puts everything back").toEqual(before);
		await t.hotkey();
		t.expect(await t.log(), "native hotkeys are back").toEqual(["cmd:hk"]);
		await t.eval(`app.plugins.enablePlugin(${id})`);
		await t.waitFor(`app.plugins.plugins[${id}]?.lifecycle?.state === "active"`);
	},
} satisfies Check;
