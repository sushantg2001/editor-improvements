import type { Check } from "../harness";

export default {
	name: "takeover",
	covers: ["V20", "V24"],
	mobile: true,
	async run(t) {
		await t.openNote("spec.md");
		await t.installRouter();
		t.expect(await t.eval("window.__R.takeover()"), "native hotkeys off").toBe("taken over");

		await t.editor("ed.setCursor({ line: 0, ch: 0 }); return true;");
		await t.pressKeys("i", "Q", "<Esc>");
		t.expect(await t.lineText(0), "unmapped keys reach the engine").toBe("QLine one alpha");
		t.expect(await t.vimMode(), "Escape reaches the engine").toBe("normal");

		await t.eval(`(window.__R.maps.set("editor C-A-u", () => window.__log.push("mapped")), true)`);
		await t.press("<C-A-u>");
		t.expect(await t.log(), "a mapped chord runs").toEqual(["mapped"]);

		await t.editor("ed.setCursor({ line: 1, ch: 0 }); return true;");
		await t.pressKeys("i", "X");
		await t.sleep(600);
		await t.press("<C-z>");
		t.expect(await t.lineText(1), "strict mode swallows Ctrl+Z in insert mode").toBe("XLine two beta");
		await t.eval("(window.__R.strict = false, true)");
		await t.press("<C-z>");
		t.expect(await t.lineText(1), "with strict mode off, CodeMirror undoes").toBe("Line two beta");
		await t.eval("(window.__R.strict = true, true)");
		await t.press("<Esc>");

		await t.press("<C-p>");
		await t.sleep(200);
		t.expect(await t.eval(`!document.querySelector(".prompt")`), "the native palette hotkey is off").toBe(true);
	},
} satisfies Check;
