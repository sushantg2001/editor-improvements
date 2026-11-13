import { afterEach } from "vitest";
import "obsidian";
import { destroyEditors } from "./helpers/vim";

afterEach(async () => {
	// The Vim addon schedules work with timers, such as updating search
	// highlights. Let any pending one run while the document still exists:
	// left to fire after the environment is torn down it fails as an unhandled
	// error, in whichever test file happens to be running then.
	await new Promise((resolve) => window.setTimeout(resolve, 0));
	// Then the editors themselves: a view that is still alive schedules a measure
	// on the next animation frame, and that fires after teardown.
	destroyEditors();
	document.body.innerHTML = "";
	delete (window as unknown as Record<string, unknown>).CodeMirrorAdapter;
});
