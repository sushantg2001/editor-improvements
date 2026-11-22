import type { Check } from "../harness";

export default {
	name: "key-repeat",
	covers: ["V10"],
	async run(t) {
		await t.openNote("spec.md");
		await t.eval(`(() => {
			const content = app.workspace.activeEditor.editor.cm.contentDOM;
			content.addEventListener("keydown", (e) => { if (e.key === "k") window.__log.push("editor"); });
			return true;
		})()`);
		await t.press("<C-A-k>", { repeat: true });
		const noScope = await t.log();
		t.expect(noScope, "the command is skipped on repeat").notToContain("cmd:hk");
		t.expect(noScope, "the key still reaches the editor").toContain("editor");

		await t.eval(`(window.__ours = window.__scope((e) => { window.__log.push("repeat:" + e.repeat); return undefined; }), true)`);
		t.cleanup(() => t.eval("(app.keymap.popScope(window.__ours), true)"));
		await t.press("<C-A-k>", { repeat: true });
		t.expect(await t.log(), "event.repeat reaches a scope").toContain("repeat:true");
	},
} satisfies Check;
