import type { Check } from "../harness";
import { parseKey } from "../keys";

const KEYS = 100;
const MAPPINGS = 500;

export default {
	name: "router-cost",
	covers: ["V22"],
	async run(t) {
		await t.openNote("spec.md");
		await t.installRouter();
		await t.eval(`(() => {
			for (let i = 0; i < ${MAPPINGS}; i++) window.__R.maps.set("global C-A-" + i, () => {});
			window.__R.costs = [];
			document.activeElement.blur();
			document.body.focus();
			return true;
		})()`);
		const key = parseKey("j");
		for (let i = 0; i < KEYS; i++) await t.page.key(key);
		const costs = await t.eval<number[]>(`window.__R.costs.slice(-${KEYS}).sort((a, b) => a - b)`);
		t.expect(costs.length, "every key was measured").toBe(KEYS);
		const p95 = costs[Math.floor(costs.length * 0.95)] ?? Number.POSITIVE_INFINITY;
		t.details = { mappings: MAPPINGS, avgMs: costs.reduce((a, b) => a + b, 0) / costs.length, p95Ms: p95, maxMs: costs.at(-1) };
		t.expect(p95, "p95 per key in ms").toBeLessThan(1);
	},
} satisfies Check;
