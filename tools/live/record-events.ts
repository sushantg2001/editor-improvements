// Records real keyboard events from an isolated Obsidian into a fixture for unit tests.
//   bun tools/live/record-events.ts <name>
// Press keys in the test window, then Ctrl+C in this terminal.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Harness } from "./harness";
import { launch } from "./launch";

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error("usage: record-events.ts <kebab-case-name>");

const instance = await launch();
const t = new Harness(instance, false);
await t.prepare();
await t.openNote("spec.md");
await t.eval(`(() => {
	window.__events = [];
	for (const type of ["keydown", "keyup"]) {
		window.addEventListener(type, (e) => window.__events.push({
			type: e.type, key: e.key, code: e.code, keyCode: e.keyCode, location: e.location,
			ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
			repeat: e.repeat, isComposing: e.isComposing,
		}), true);
	}
	return true;
})()`);
process.stdout.write("Recording. Press keys in the test window, then Ctrl+C here.\n");

process.on("SIGINT", () => {
	void (async () => {
		const events = await t.eval<unknown[]>("window.__events");
		const dir = resolve(import.meta.dir, "../../test/fixtures/events");
		mkdirSync(dir, { recursive: true });
		const file = resolve(dir, `${name}.json`);
		writeFileSync(file, `${JSON.stringify(events, null, "\t")}\n`);
		process.stdout.write(`Wrote ${events.length} events to ${file}\n`);
		await instance.stop();
		process.exit(0);
	})();
});
