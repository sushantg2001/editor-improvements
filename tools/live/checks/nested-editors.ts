import type { Check, Harness } from "../harness";

const ours = `(window.__ours = window.__scope((e) => {
	const inEditor = !!(e.target.closest && e.target.closest(".cm-editor"));
	window.__log.push("ours:" + inEditor);
	return inEditor ? true : undefined;
}), true)`;
const oursOnTop = "app.keymap.getWindowStack(window).scope === window.__ours";

const startCardEdit = (t: Harness) =>
	t.eval(`(async () => {
		const canvas = app.workspace.getActiveViewOfType(app.workspace.activeLeaf.view.constructor).canvas;
		const node = [...canvas.nodes.values()][0];
		window.__node = node;
		canvas.selectOnly(node);
		node.startEditing();
		await new Promise((resolve) => setTimeout(resolve, 700));
		return true;
	})()`);

/** Whether the card is still being edited after a first and a second Escape. */
async function escapes(t: Harness): Promise<boolean[]> {
	await t.pressKeys("i", "Q", "<Esc>");
	await t.sleep(150);
	const first = await t.eval<boolean>("!!window.__node.isEditing");
	await t.press("<Esc>");
	await t.sleep(300);
	return [first, await t.eval<boolean>("!!window.__node.isEditing")];
}

export default {
	name: "nested-editors",
	covers: ["V7"],
	async run(t) {
		await t.openNote("table.md");
		await t.eval(ours);
		const cell = await t.eval<{ x: number; y: number } | null>(`(() => {
			const td = document.querySelector(".cm-table-widget td");
			if (!td) return null;
			const box = td.getBoundingClientRect();
			return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		})()`);
		if (!cell) throw new Error("no table cell in Live Preview");
		await t.click(cell.x, cell.y);
		await t.log();
		t.expect(await t.eval("!!document.activeElement.closest('.cm-table-widget .cm-editor')"), "focus is in the cell's editor").toBe(true);
		t.expect(await t.eval(oursOnTop), "a cell pushes no scope").toBe(true);
		await t.hotkey();
		t.expect(await t.log(), "a top scope sees the cell's keys").toEqual(["ours:true"]);
		await t.pressKeys("i", "Q", "<Esc>");
		t.expect(await t.eval("document.querySelector('.cm-table-widget').innerText"), "vim runs in the cell").toContain("Q");
		await t.eval("(app.keymap.popScope(window.__ours), true)");

		await t.eval(`(async () => {
			await app.workspace.getLeaf("tab").openFile(app.vault.getFileByPath("card.canvas"));
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return true;
		})()`);
		await startCardEdit(t);
		const without = await escapes(t);

		await t.eval(ours);
		await startCardEdit(t);
		// A card's editor lives in a same-origin iframe, so the main document only sees the iframe.
		t.expect(await t.eval(`!!document.activeElement.contentDocument?.activeElement?.closest(".cm-editor")`), "focus is in the card's editor").toBe(true);
		t.expect(await t.eval(oursOnTop), "a card pushes no scope").toBe(true);
		await t.log();
		await t.hotkey();
		t.expect(await t.log(), "a top scope sees the card's keys").toEqual(["ours:true"]);
		await t.pressKeys("i", "Q", "<Esc>");
		await t.sleep(150);
		t.expect(await t.eval(`document.activeElement.contentDocument.querySelector(".cm-content").innerText`), "vim runs in the card").toContain("Q");
		await t.press("<Esc>");
		await t.sleep(300);
		await startCardEdit(t);
		const withScope = await escapes(t);
		t.expect(withScope, "Escape behaves the same with a top scope").toEqual(without);
		t.details = { escapesEditing: without };
		await t.eval("(app.keymap.popScope(window.__ours), true)");
	},
} satisfies Check;
