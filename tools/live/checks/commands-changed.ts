import type { Check } from "../harness";

export default {
	name: "commands-changed",
	covers: ["V26"],
	async run(t) {
		const fired = await t.eval<number>(`(() => {
			let count = 0;
			const ref = app.commands.on("changed", () => count++);
			app.commands.addCommand({ id: "probe:changed", name: "changed", callback() {} });
			const afterAdd = count;
			app.commands.removeCommand("probe:changed");
			app.commands.offref(ref);
			return afterAdd === 1 && count === 2 ? 2 : -count;
		})()`);
		t.expect(fired, "one event for the add and one for the remove").toBe(2);
	},
} satisfies Check;
