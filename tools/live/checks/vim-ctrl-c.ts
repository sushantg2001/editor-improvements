import type { Check } from "../harness";

const select = "ed.setSelection({ line: 2, ch: 0 }, { line: 2, ch: 4 }); return true;";

export default {
	name: "vim-ctrl-c",
	covers: ["V5"],
	async run(t) {
		await t.openNote("spec.md");
		// Counts copies and stops them, so the check never writes the system clipboard.
		await t.eval(`(() => {
			window.__copies = 0;
			document.addEventListener("copy", (e) => { window.__copies++; e.preventDefault(); e.stopImmediatePropagation(); }, true);
			window.CodeMirrorAdapter.Vim.noremap("<C-c>", "d", "visual");
			return true;
		})()`);
		t.cleanup(() => t.eval("(window.CodeMirrorAdapter.Vim.mapclear(), true)"));

		await t.editor(select);
		await t.press("<C-c>", { commands: ["copy"] });
		await t.sleep(150);
		t.expect(await t.eval("window.__copies"), "vim gives Ctrl+C to the browser").toBe(1);
		t.expect(await t.lineText(2), "the visual mapping is ignored").toBe("Line three gamma");

		await t.editor(select);
		await t.eval(`(window.__s = window.__scope((e) => (e.ctrlKey && e.key === "c" ? false : undefined)), true)`);
		await t.press("<C-c>", { commands: ["copy"] });
		await t.sleep(150);
		t.expect(await t.eval("window.__copies"), "a scope returning false stops the copy").toBe(1);
		t.expect(await t.editor("return ed.getSelection();"), "the selection is kept").toBe("Line");
		await t.eval("(app.keymap.popScope(window.__s), true)");
	},
} satisfies Check;
