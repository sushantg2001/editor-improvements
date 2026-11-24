import type { Check } from "../harness";

const lifecycle = `app.plugins.plugins["editor-improvements"].lifecycle`;

export default {
	name: "core-starter",
	covers: ["CONFIG-R8", "LUA-A3"],
	async run(t) {
		await t.openNote("spec.md");
		// An empty config is replaced by nothing, so remove it and let setup write the starter.
		await t.activatePlugin("");
		await t.eval(`(async () => {
			await app.plugins.disablePlugin("editor-improvements");
			await app.vault.adapter.remove(app.vault.configDir + "/editor-improvements/init.lua");
			localStorage.setItem("editor-improvements:" + app.appId + ":setup", JSON.stringify("declined"));
			await app.plugins.enablePlugin("editor-improvements");
			await ${lifecycle}.setUp();
			return true;
		})()`);
		t.expect(await t.pluginState(), "setup with the starter config").toBe("active");
		t.expect(await t.eval(`${lifecycle}.configErrors`), "every command in the starter exists").toEqual([]);
		t.expect(await t.eval(`app.vault.adapter.read(app.vault.configDir + "/editor-improvements/init.lua").then((text) => text.includes("mapleader"))`), "the starter was written").toBe(true);

		await t.openNote("spec.md");
		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");
		await t.press("j");
		await t.sleep(100);
		t.expect(await t.editor("return ed.getCursor().line;"), "j moves down").toBe(1);
		await t.pressKeys("i", "j", "k");
		await t.sleep(150);
		t.expect(await t.vimMode(), "jk leaves insert mode").toBe("normal");
		await t.press("<C-p>");
		await t.waitFor(`!!document.querySelector(".prompt")`);
		await t.press("<Esc>");
		await t.waitFor(`!document.querySelector(".prompt")`);
		await t.pressKeys("<Space>", "f");
		await t.waitFor(`!!document.querySelector(".prompt")`);
		await t.press("<Esc>");
		await t.waitFor(`!document.querySelector(".prompt")`);
		await t.waitFor(`document.querySelector(".editor-improvements-status").textContent === "NORMAL"`);
	},
} satisfies Check;
