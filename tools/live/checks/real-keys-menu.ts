import type { Check, Harness } from "../harness";

const clipboard = (t: Harness) => t.eval<string>(`window.require("electron").clipboard.readText()`);
const setClipboard = (t: Harness, text: string) => t.eval(`(window.require("electron").clipboard.writeText(${JSON.stringify(text)}), true)`);
const cancel = (t: Harness, key: string) => t.eval(`(window.__s = window.__scope((e) => (e.ctrlKey && e.key === ${JSON.stringify(key)} ? false : undefined)), true)`);
const release = (t: Harness) => t.eval("(app.keymap.popScope(window.__s), true)");
const select = (t: Harness) => t.editor("ed.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 8 }); return true;");

export default {
	name: "real-keys-menu",
	covers: ["V6"],
	realKeys: true,
	async run(t) {
		await t.keepClipboard();
		await t.openNote("spec.md");

		await setClipboard(t, "SENTINEL");
		await select(t);
		await t.realKey("Control_L+c");
		t.expect(await clipboard(t), "Ctrl+C, no scope").toBe("one");

		await setClipboard(t, "SENTINEL");
		await select(t);
		await cancel(t, "c");
		await t.realKey("Control_L+c");
		t.expect(await clipboard(t), "Ctrl+C, cancelled").toBe("SENTINEL");
		await release(t);

		await t.press("<Esc>");
		await t.editor("ed.setCursor({ line: 1, ch: 0 }); return true;");
		await t.press("i");
		await setClipboard(t, "PASTED");
		await cancel(t, "v");
		await t.realKey("Control_L+v");
		t.expect(await t.lineText(1), "Ctrl+V, cancelled").toBe("Line two beta");
		await release(t);
		await t.realKey("Control_L+v");
		t.expect(await t.lineText(1), "Ctrl+V, no scope").toBe("PASTEDLine two beta");

		await cancel(t, "z");
		await t.realKey("Control_L+z");
		t.expect(await t.lineText(1), "Ctrl+Z, cancelled").toBe("PASTEDLine two beta");
		await release(t);
		await t.realKey("Control_L+z");
		t.expect(await t.lineText(1), "Ctrl+Z, no scope").toBe("Line two beta");
		await t.press("<Esc>");
	},
} satisfies Check;
