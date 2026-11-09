import { afterEach } from "vitest";
import "obsidian";

afterEach(async () => {
	// The Vim addon schedules work with timers, such as updating search
	// highlights. Let any pending one run while the document still exists:
	// left to fire after the environment is torn down it fails as an unhandled
	// error, in whichever test file happens to be running then.
	await new Promise((resolve) => window.setTimeout(resolve, 0));
	document.body.innerHTML = "";
	delete (window as unknown as Record<string, unknown>).CodeMirrorAdapter;
});
