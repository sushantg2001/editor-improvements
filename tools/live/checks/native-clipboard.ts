import type { Check } from "../harness";

const clipboard = `window.require("electron").clipboard`;

export default {
	name: "native-clipboard",
	covers: ["V25"],
	async run(t) {
		await t.keepClipboard();
		await t.openNote("spec.md");
		await t.installRouter();
		await t.eval(`(() => {
			for (const type of ["copy", "paste"]) document.addEventListener(type, () => window.__log.push(type + " event"), true);
			const R = window.__R;
			R.maps.set("editor C-c", () => window.__log.push("copy returned " + document.execCommand("copy")));
			R.maps.set("editor C-v", () => window.__log.push("paste returned " + document.execCommand("paste")));
			${clipboard}.writeText("SENTINEL");
			return true;
		})()`);

		await t.editor("ed.setSelection({ line: 2, ch: 0 }, { line: 2, ch: 4 }); return true;");
		await t.press("<C-c>");
		await t.sleep(200);
		t.expect(await t.log(), "execCommand copy fires the copy handler").toEqual(["copy event", "copy returned true"]);
		t.expect(await t.eval(`${clipboard}.readText()`), "and sets the clipboard").toBe("Line");

		await t.press("<Esc>");
		await t.eval(`(${clipboard}.writeText("PASTED"), true)`);
		await t.editor("ed.setCursor({ line: 2, ch: 0 }); return true;");
		await t.press("i");
		await t.log();
		await t.press("<C-v>");
		await t.sleep(200);
		t.expect(await t.log(), "execCommand paste is blocked").toEqual(["paste returned false"]);
		t.expect(await t.lineText(2), "nothing is pasted").toBe("Line three gamma");

		await t.eval(`(window.__R.maps.set("editor C-v", () => window.require("@electron/remote").getCurrentWebContents().paste()), true)`);
		await t.press("<C-v>");
		await t.sleep(400);
		t.expect(await t.log(), "webContents.paste fires a real paste event").toEqual(["paste event"]);
		t.expect(await t.lineText(2), "and inserts the text").toBe("PASTEDLine three gamma");
		await t.press("<Esc>");
	},
} satisfies Check;
