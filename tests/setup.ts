import { afterEach } from "vitest";
import "obsidian";

afterEach(() => {
	document.body.innerHTML = "";
	delete (window as unknown as Record<string, unknown>).CodeMirrorAdapter;
});
