import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../../../src/core/registry";
import { ScriptHost } from "../../../src/scripts/loader";
import { App } from "../../mocks/obsidian";

const FOLDER = ".obsidian/editor-improvements";

async function run(code: string) {
	const app = new App();
	app.vault.adapter.dirs.add(FOLDER);
	app.vault.adapter.files.set(`${FOLDER}/init.js`, code);
	const host = new ScriptHost({
		app: app as never,
		registry: new ActionRegistry(),
		getVim: () => null,
		isEnabled: () => true,
		getFolder: () => FOLDER,
		getLeader: () => "\\",
	});
	const result = await host.reload();
	return result.errors[0];
}

/**
 * Node names the script's frames `anonymous`; other hosts report them as
 * `<anonymous>:line:column` with no function name. The script below takes its
 * own real position and throws an error whose stack is written the second way.
 */
const THROW_IN_OTHER_FORM = [
	`const real = new Error("probe").stack.split("\\n").find((f) => /anonymous/.test(f));`,
	`const [, row, col] = /:(\\d+):(\\d+)\\)?\\s*$/.exec(real);`,
	`const error = new Error("other host");`,
	`error.stack = "Error: other host\\n    at plugin (main.js:1:1)\\n    at eval (eval at <anonymous> (main.js:1:1), <anonymous>:" + row + ":" + col + ")";`,
	`throw error;`,
].join(" ");

describe("a script frame in the form some hosts use", () => {
	it("names the line from a frame located in <anonymous>", async () => {
		const error = await run(`\n\n${THROW_IN_OTHER_FORM}`);

		expect(error).toMatchObject({ message: "other host", line: 3 });
	});

	it("ignores a plugin frame with the same shape of position", async () => {
		const error = await run(
			`\n\nconst error = new Error("elsewhere"); error.stack = "Error: elsewhere\\n    at plugin (main.js:9:9)"; throw error;`,
		);

		expect(error?.message).toBe("elsewhere");
		expect(error?.line).toBeUndefined();
	});
});
