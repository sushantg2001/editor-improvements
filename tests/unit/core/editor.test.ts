import { describe, expect, it } from "vitest";

import { getVimMode } from "../../../src/core/editor";
import type { CodeMirrorShim } from "../../../src/types";

function cmWithMode(mode: string | undefined): CodeMirrorShim {
	return { state: { vim: { mode } } } as CodeMirrorShim;
}

describe("getVimMode", () => {
	it("defaults to normal when there is no editor or no vim state", () => {
		expect(getVimMode(null)).toBe("normal");
		expect(getVimMode({ state: {} } as CodeMirrorShim)).toBe("normal");
		expect(getVimMode(cmWithMode(undefined))).toBe("normal");
	});

	it("passes through the modes we render", () => {
		expect(getVimMode(cmWithMode("insert"))).toBe("insert");
		expect(getVimMode(cmWithMode("visual"))).toBe("visual");
		expect(getVimMode(cmWithMode("replace"))).toBe("replace");
	});

	it("recognises the space-separated visual sub-modes", () => {
		// Regression: these were falling through to "normal", so the status
		// bar claimed NORMAL while the user was in V or Ctrl-V.
		expect(getVimMode(cmWithMode("visual line"))).toBe("visual-line");
		expect(getVimMode(cmWithMode("visual block"))).toBe("visual-block");
	});

	it("treats a genuinely unknown mode as normal", () => {
		expect(getVimMode(cmWithMode("something-else"))).toBe("normal");
	});
});
