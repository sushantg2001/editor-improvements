import type { Check } from "../harness";

const CONFIG = `
vim.g.mapleader = " "
vim.o.timeoutlen = 300
obsidian.keymap.set("global", "<C-p>", "obsidian:command-palette:open")
obsidian.keymap.set("editor:n", "<C-A-u>", function() obsidian.command("probe:hk") end)
vim.keymap.set("n", "<leader>x", function() obsidian.command("probe:hk") end)
vim.keymap.set("n", "Z", "dd")
vim.keymap.set("i", "jk", "<Esc>")
`;

export default {
	name: "core-keys",
	covers: ["ROUTER-A4", "ROUTER-A5", "ROUTER-A8", "ACTIONS-A1", "LUA-A3"],
	async run(t) {
		await t.openNote("spec.md");
		await t.activatePlugin(CONFIG);
		t.expect(await t.pluginState()).toBe("active");
		await t.openNote("spec.md");
		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");

		await t.pressKeys("i", "Q", "<Esc>");
		await t.sleep(100);
		t.expect(await t.lineText(0), "unmapped keys reach the engine").toBe("QLine one alpha");

		await t.press("<C-A-u>");
		t.expect(await t.log(), "a mapped Lua function runs").toEqual(["cmd:hk"]);

		await t.pressKeys("<Space>", "x");
		t.expect(await t.log(), "a leader sequence runs").toEqual(["cmd:hk"]);

		await t.pressKeys("<Space>", "l");
		await t.sleep(100);
		t.expect(await t.log(), "a broken sequence runs nothing").toEqual([]);

		await t.editor("ed.setCursor({ line: 1, ch: 0 }); return true;");
		await t.press("Z");
		await t.sleep(100);
		t.expect(await t.lineText(1), "an engine mapping runs").toBe("Line three gamma");

		await t.pressKeys("i", "j", "k");
		await t.sleep(150);
		t.expect(await t.vimMode(), "jk leaves insert mode").toBe("normal");
		t.expect(await t.lineText(1), "jk types nothing").toBe("Line three gamma");

		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");
		await t.pressKeys("i", "X");
		await t.sleep(600);
		await t.press("<C-z>");
		t.expect(await t.lineText(0), "strict keys swallow unmapped Ctrl+Z").toBe("XQLine one alpha");
		await t.press("<Esc>");

		await t.press("<C-p>");
		await t.waitFor(`!!document.querySelector(".prompt")`);
		await t.pressKeys("a", "b");
		t.expect(await t.eval(`document.querySelector(".prompt-input").value`), "the palette keeps its keys").toBe("ab");
		await t.press("<Esc>");
		await t.waitFor(`!document.querySelector(".prompt")`);
		await t.press("<C-A-k>");
		t.expect(await t.log(), "native hotkeys stay off").toEqual([]);
	},
} satisfies Check;
