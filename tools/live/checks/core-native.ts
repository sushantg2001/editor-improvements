import type { Check } from "../harness";

const clipboard = `window.require("electron").clipboard`;
const CONFIG = `
obsidian.keymap.set({ "editor:v", "editor:i" }, "<C-c>", "native:copy")
obsidian.keymap.set({ "editor:v", "editor:i" }, "<C-x>", "native:cut")
obsidian.keymap.set({ "editor:n", "editor:i" }, "<C-v>", "native:paste")
obsidian.keymap.set("editor:i", "<C-S-v>", "native:paste-plain")
obsidian.keymap.set("editor:i", "<C-z>", "native:undo")
obsidian.keymap.set("editor:i", "<C-y>", "native:redo")
obsidian.keymap.set({ "editor:n", "editor:i" }, "<C-a>", "native:select-all")
`;

export default {
	name: "core-native",
	covers: ["ACTIONS-A4", "ACTIONS-A5", "ACTIONS-A6", "ACTIONS-A9", "ROUTER-A6"],
	async run(t) {
		await t.keepClipboard();
		await t.openNote("spec.md");
		await t.activatePlugin(CONFIG);
		await t.openNote("spec.md");

		await t.editor("ed.setCursor({ line: 2, ch: 0 }); return true;");
		await t.pressKeys("v", "l", "l", "l");
		await t.press("<C-c>");
		await t.sleep(150);
		t.expect(await t.eval(`${clipboard}.readText()`), "copy").toBe("Line");
		t.expect(await t.vimMode(), "copy leaves visual mode").toBe("normal");

		await t.editor("ed.setCursor({ line: 2, ch: 0 }); return true;");
		await t.pressKeys("v", "l", "l", "l", "l");
		await t.eval(`(${clipboard}.writeText("placeholder"), true)`);
		await t.press("<C-x>");
		await t.sleep(150);
		t.expect(await t.lineText(2), "cut removes the text").toBe("three gamma");
		t.expect(await t.eval(`${clipboard}.readText()`), "cut copies it").toBe("Line ");

		await t.eval(`(${clipboard}.writeText("PASTED"), true)`);
		await t.editor("ed.setCursor({ line: 1, ch: 0 }); return true;");
		await t.press("i");
		await t.press("<C-v>");
		await t.waitFor(`app.workspace.activeEditor.editor.getLine(1).startsWith("PASTED")`);
		await t.sleep(600);
		await t.press("<C-S-v>");
		await t.waitFor(`app.workspace.activeEditor.editor.getLine(1).startsWith("PASTEDPASTED")`);
		await t.sleep(600);
		await t.press("<C-z>");
		await t.sleep(120);
		t.expect(await t.lineText(1), "undo").toBe("PASTEDLine two beta");
		await t.press("<C-y>");
		await t.sleep(120);
		t.expect(await t.lineText(1), "redo").toBe("PASTEDPASTEDLine two beta");

		await t.press("<C-a>");
		await t.sleep(100);
		t.expect(await t.editor("return ed.getSelection() === ed.getValue();"), "select all in insert mode").toBe(true);
		await t.press("<Esc>");
		await t.sleep(100);
		await t.press("<C-a>");
		await t.sleep(100);
		t.expect(await t.vimMode(), "select all in normal mode").toBe("visual");
		await t.press("<Esc>");

		const commands = await t.eval<string[]>(`Object.keys(app.commands.commands).filter((id) => id.startsWith("editor-improvements:"))`);
		for (const name of ["native-copy", "native-cut", "native-paste", "native-undo", "native-redo", "native-select-all", "plugin-reload", "plugin-safe-mode"]) {
			t.expect(commands, "in the command palette").toContain(`editor-improvements:${name}`);
		}
	},
} satisfies Check;
