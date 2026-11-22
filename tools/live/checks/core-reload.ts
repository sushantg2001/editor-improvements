import type { Check } from "../harness";

const errors = `app.plugins.plugins["editor-improvements"].lifecycle.configErrors`;

export default {
	name: "core-reload",
	covers: ["CONFIG-A3", "CONFIG-A4", "ACTIONS-A2"],
	async run(t) {
		await t.openNote("spec.md");
		await t.activatePlugin(`vim.keymap.set("n", "Z", "dd")`);
		await t.openNote("spec.md");

		await t.writeConfig(`vim.keymap.set("n", "Z", "dd")\n\nthis is not lua`);
		await t.waitFor(`${errors}.length === 1`);
		t.expect(await t.eval(`${errors}[0]`), "the error names file and line").toContain("init.lua:3");
		t.expect(await t.pluginState(), "a broken save keeps running").toBe("active");
		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");
		await t.press("Z");
		await t.sleep(100);
		t.expect(await t.lineText(0), "the last good keymap still works").toBe("Line two beta");

		await t.writeConfig(`vim.keymap.set("n", "W", "dd")\nobsidian.keymap.set("global", "<C-p>", "obsidian:no-such:command")`);
		await t.waitFor(`${errors}.length === 1 && ${errors}[0].includes("no-such")`);
		await t.press("Z");
		await t.sleep(100);
		t.expect(await t.lineText(0), "the old mapping is gone").toBe("Line two beta");
		await t.press("<Esc>");
		await t.press("W");
		await t.sleep(100);
		t.expect(await t.lineText(0), "the new mapping works, despite an unknown command").toBe("Line three gamma");

		await t.writeConfig(`vim.keymap.set("n", "W", "dd")`);
		await t.waitFor(`${errors}.length === 0`);
	},
} satisfies Check;
