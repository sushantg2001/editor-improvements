import type { Check } from "../harness";

export default {
	name: "hotkey-catch-all",
	covers: ["V3"],
	async run(t) {
		await t.openNote("spec.md");
		const only = await t.eval(`app.scope.keys.length === 1 && app.scope.keys[0].key === null && app.scope.keys[0].modifiers === null`);
		t.expect(only, "one catch-all is the root scope's only entry").toBe(true);

		await t.eval(`(window.__entry = app.scope.keys.splice(0, 1)[0], true)`);
		t.cleanup(() => t.eval(`(window.__entry && !app.scope.keys.includes(window.__entry) && app.scope.keys.unshift(window.__entry), true)`));
		await t.hotkey();
		t.expect(await t.log(), "removed").toEqual([]);

		await t.eval(`(app.scope.keys.unshift(window.__entry), true)`);
		await t.hotkey();
		t.expect(await t.log(), "re-inserted").toEqual(["cmd:hk"]);
	},
} satisfies Check;
