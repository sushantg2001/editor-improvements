import type { Check } from "../harness";

const COMPOSING = "にほん";
const COMMITTED = "日本";

export default {
	name: "ime",
	covers: ["V9"],
	async run(t) {
		await t.openNote("spec.md");
		await t.editor("ed.setCursor({ line: 2, ch: 0 }); return true;");
		await t.press("i");
		await t.eval(`(window.__ours = window.__scope((e) => {
			window.__log.push(e.key + ":" + e.keyCode);
			return e.target.closest && e.target.closest(".cm-editor") ? true : undefined;
		}), true)`);
		t.cleanup(() => t.eval("(app.keymap.popScope(window.__ours), true)"));

		await t.page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code: "KeyN", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
		await t.page.send("Input.imeSetComposition", { text: COMPOSING, selectionStart: 3, selectionEnd: 3 });
		await t.sleep(150);
		await t.page.send("Input.insertText", { text: COMMITTED });
		await t.sleep(200);
		t.expect(await t.log(), "a scope sees only the Process key").toEqual(["Process:229"]);
		t.expect(await t.lineText(2), "composed text is inserted").toBe(`${COMMITTED}Line three gamma`);
		await t.press("<Esc>");
	},
} satisfies Check;
