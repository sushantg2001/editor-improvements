import type { Check, Harness } from "../harness";

const PANIC = "<C-A-S-F12>";
const lifecycle = `app.plugins.plugins["editor-improvements"].lifecycle`;
const waitState = (t: Harness, state: string) => t.waitFor(`${lifecycle}.state === ${JSON.stringify(state)}`);

export default {
	name: "core-safe",
	covers: ["ROUTER-A11", "LIFE-A5", "CONFIG-A4", "UI-A1"],
	async run(t) {
		await t.openNote("spec.md");
		await t.activatePlugin(`obsidian.keymap.set("global", "<C-A-u>", "obsidian:probe:hk")`);
		await t.openNote("spec.md");

		await t.press(PANIC);
		await waitState(t, "safe");
		await t.sleep(80);
		t.expect(await t.eval(`document.querySelector(".editor-improvements-status").textContent`), "the status bar says so").toBe("SAFE MODE");
		await t.hotkey();
		t.expect(await t.log(), "Obsidian's hotkeys are back").toEqual(["cmd:hk"]);
		await t.press("<C-A-u>");
		t.expect(await t.log(), "your keymap is off").toEqual([]);

		await t.reloadWindow();
		await waitState(t, "safe");
		t.expect(await t.eval(`app.scope.keys.length`), "safe mode survives a reload").toBe(1);
		await t.openNote("spec.md");

		await t.press(PANIC);
		await waitState(t, "active");
		await t.press("<C-A-u>");
		t.expect(await t.log(), "leaving safe mode restores the keymap").toEqual(["cmd:hk"]);

		await t.eval(`(app.commands.executeCommandById("command-palette:open"), true)`);
		await t.waitFor(`!!document.querySelector(".prompt")`);
		await t.press(PANIC);
		await waitState(t, "safe");
		await t.press(PANIC);
		await waitState(t, "active");
		await t.press("<Esc>");
		await t.waitFor(`!document.querySelector(".prompt")`);

		await t.eval(`(async () => {
			const leaf = app.workspace.getLeavesOfType("file-explorer")[0];
			await app.workspace.revealLeaf(leaf);
			app.workspace.setActiveLeaf(leaf, { focus: true });
			leaf.view.containerEl.querySelector(".nav-files-container").focus();
			return true;
		})()`);
		await t.press(PANIC);
		await waitState(t, "safe");
		await t.press(PANIC);
		await waitState(t, "active");

		// A config that is broken from the start must not take the keyboard.
		await t.writeConfig("this is not lua");
		await t.eval(`(async () => {
			await app.plugins.disablePlugin("editor-improvements");
			await app.plugins.enablePlugin("editor-improvements");
			return true;
		})()`);
		await waitState(t, "safe");
		await t.openNote("spec.md");
		await t.hotkey();
		t.expect(await t.log(), "a broken first load leaves Obsidian's hotkeys on").toEqual(["cmd:hk"]);
		await t.writeConfig(`obsidian.keymap.set("global", "<C-A-u>", "obsidian:probe:hk")`);
		await waitState(t, "active");
		await t.press("<C-A-u>");
		t.expect(await t.log(), "fixing the config leaves safe mode").toEqual(["cmd:hk"]);
	},
} satisfies Check;
