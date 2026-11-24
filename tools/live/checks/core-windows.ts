import type { Check } from "../harness";

const CONFIG = `
obsidian.keymap.set("global", "<C-A-u>", "obsidian:probe:hk")
obsidian.keymap.set("editor", "<C-A-j>", "obsidian:probe:hk")
vim.keymap.set("n", "Z", "dd")
`;

export default {
	name: "core-windows",
	covers: ["ROUTER-A3", "ROUTER-A13", "ROUTER-A14"],
	async run(t) {
		await t.openNote("table.md");
		await t.activatePlugin(CONFIG);
		await t.openNote("table.md");

		const cell = await t.eval<{ x: number; y: number }>(`(() => {
			const box = document.querySelector(".cm-table-widget td").getBoundingClientRect();
			return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		})()`);
		await t.click(cell.x, cell.y);
		await t.press("<C-A-j>");
		t.expect(await t.log(), "a table cell is the editor context").toEqual(["cmd:hk"]);
		await t.pressKeys("i", "Q", "<Esc>");
		await t.sleep(150);
		t.expect(await t.eval("document.querySelector('.cm-table-widget').innerText"), "the engine runs in the cell").toContain("Q");

		await t.eval(`(async () => {
			const leaf = app.workspace.getLeaf("tab");
			await leaf.openFile(app.vault.getFileByPath("card.canvas"));
			await new Promise((resolve) => setTimeout(resolve, 900));
			const canvas = leaf.view.canvas;
			const node = [...canvas.nodes.values()][0];
			canvas.selectOnly(node);
			node.startEditing();
			await new Promise((resolve) => setTimeout(resolve, 700));
			return true;
		})()`);
		await t.press("<C-A-j>");
		t.expect(await t.log(), "a canvas card is the editor context").toEqual(["cmd:hk"]);
		await t.pressKeys("i", "Q", "<Esc>");
		await t.sleep(150);
		t.expect(await t.eval(`document.activeElement.contentDocument.querySelector(".cm-content").innerText`), "the engine runs in the card").toContain("Q");
		await t.press("<Esc>");

		const popout = await t.openPopout("spec.md");
		await t.sleep(200);
		await t.press("<C-A-u>", { page: popout });
		t.expect(await t.log(), "a mapped key works in a popout").toEqual(["cmd:hk"]);
		await t.press("Z", { page: popout });
		await t.sleep(150);
		t.expect(await popout.eval(`document.querySelector(".cm-content").innerText.startsWith("Line two")`), "an engine mapping works there").toBe(true);
		await popout.eval(`(app.commands.executeCommandById("command-palette:open"), true)`);
		await t.sleep(400);
		t.expect(await popout.eval(`!!document.querySelector(".prompt")`), "the palette opens there").toBe(true);
		await t.press("<Esc>", { page: popout });
		await t.sleep(300);
		t.expect(await popout.eval(`!document.querySelector(".prompt")`), "Escape closes it").toBe(true);
	},
} satisfies Check;
