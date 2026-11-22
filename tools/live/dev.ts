// An isolated Obsidian running this working copy's build. It reloads the plugin
// after each build. Run `bun run dev` in another terminal.
import { watch } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PORT, launch, PLUGIN_ID } from "./launch";

const id = JSON.stringify(PLUGIN_ID);
const instance = await launch({ linkPlugin: true });
process.stdout.write(`Test instance ready. DevTools: http://127.0.0.1:${DEFAULT_PORT}. Ctrl+C stops it.\n`);

let timer: ReturnType<typeof setTimeout> | undefined;
const reload = async (): Promise<void> => {
	try {
		await instance.page.eval(`(async () => { await app.plugins.disablePlugin(${id}); await app.plugins.enablePlugin(${id}); return true; })()`);
		process.stdout.write(`Reloaded at ${new Date().toLocaleTimeString()}\n`);
	} catch (error) {
		process.stderr.write(`Reload failed: ${String(error)}\n`);
	}
};

// esbuild replaces the file, so watch the folder rather than the file.
const watcher = watch(resolve(import.meta.dir, "../.."), (_, name) => {
	if (name !== "main.js") return;
	clearTimeout(timer);
	timer = setTimeout(() => void reload(), 150);
});

const stop = (): void => {
	watcher.close();
	void instance.stop().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
instance.process.on("exit", stop);
