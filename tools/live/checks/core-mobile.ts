import type { Check } from "../harness";

const lifecycle = `app.plugins.plugins["editor-improvements"].lifecycle`;

export default {
	name: "core-mobile",
	covers: ["ADR-0007"],
	mobileOnly: true,
	async run(t) {
		await t.eval(`(localStorage.removeItem("editor-improvements:" + app.appId + ":setup"), true)`);
		t.cleanup(() => t.eval(`(localStorage.setItem("editor-improvements:" + app.appId + ":setup", JSON.stringify("declined")), true)`));
		await t.eval(`(async () => {
			await app.plugins.disablePlugin("editor-improvements");
			await app.plugins.enablePlugin("editor-improvements");
			await new Promise((resolve) => setTimeout(resolve, 300));
			return true;
		})()`);
		t.expect(await t.eval(`!!document.querySelector(".modal-container")`), "no first-run prompt").toBe(false);
		await t.eval(`${lifecycle}.setUp()`);
		t.expect(await t.pluginState(), "stays inactive").toBe("inactive");
		t.expect(await t.eval(`app.scope.keys.length`), "Obsidian's hotkeys stay on").toBe(1);
		t.expect(await t.eval(`app.vault.adapter.exists(app.vault.configDir + "/editor-improvements")`), "writes nothing").toBe(false);
	},
} satisfies Check;
