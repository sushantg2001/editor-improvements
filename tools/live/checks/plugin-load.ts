import type { Check } from "../harness";
import { PLUGIN_ID } from "../launch";

const id = JSON.stringify(PLUGIN_ID);

export default {
	name: "plugin-load",
	covers: ["LIFE-A2"],
	mobile: true,
	async run(t) {
		const errorsBefore = t.page.exceptions.length;
		t.expect(await t.eval(`app.plugins.plugins[${id}]._loaded`), "loaded").toBe(true);
		await t.eval(`app.plugins.disablePlugin(${id})`);
		t.expect(await t.eval(`!!app.plugins.plugins[${id}]`), "after disable").toBe(false);
		await t.eval(`app.plugins.enablePlugin(${id})`);
		t.expect(await t.eval(`app.plugins.plugins[${id}]._loaded`), "after enable").toBe(true);
		t.expect(t.page.exceptions.slice(errorsBefore), "uncaught errors").toEqual([]);
	},
} satisfies Check;
