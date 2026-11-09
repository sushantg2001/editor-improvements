import { describe, expect, it, vi } from "vitest";

import { CmListeners } from "../../src/core/cm-listeners";
import type { CodeMirrorShim } from "../../src/types";

function fakeCm(connected = true) {
	const field = document.createElement("div");
	if (connected) {
		document.body.appendChild(field);
	}
	const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
	return {
		field,
		handlers,
		cm: {
			getInputField: () => field,
			on: (event: string, handler: (...a: unknown[]) => void) => {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
			off: (event: string, handler: (...a: unknown[]) => void) => {
				handlers.set(
					event,
					(handlers.get(event) ?? []).filter((h) => h !== handler),
				);
			},
		} as unknown as CodeMirrorShim,
	};
}

describe("CmListeners", () => {
	it("attaches a handler once per editor", () => {
		const listeners = new CmListeners("evt", () => () => {});
		const { cm, handlers } = fakeCm();

		expect(listeners.attach(cm)).toBe(true);
		expect(listeners.attach(cm)).toBe(false);
		expect(handlers.get("evt")).toHaveLength(1);
	});

	it("builds a separate handler per editor", () => {
		const factory = vi.fn(() => () => {});
		const listeners = new CmListeners("evt", factory);

		listeners.attach(fakeCm().cm);
		listeners.attach(fakeCm().cm);

		expect(factory).toHaveBeenCalledTimes(2);
		expect(listeners.size).toBe(2);
	});

	it("prunes editors whose DOM has gone away, so it stays bounded", () => {
		// Regression: registering a Component cleanup per attach grew an
		// unbounded array of closures, one per editor ever opened, each
		// keeping that editor alive for the whole session.
		const listeners = new CmListeners("evt", () => () => {});
		const first = fakeCm();
		listeners.attach(first.cm);
		expect(listeners.size).toBe(1);

		first.field.remove();
		listeners.attach(fakeCm().cm);

		expect(listeners.size).toBe(1);
		expect(first.handlers.get("evt")).toHaveLength(0);
	});

	it("detaches everything on demand", () => {
		const listeners = new CmListeners("evt", () => () => {});
		const a = fakeCm();
		const b = fakeCm();
		listeners.attach(a.cm);
		listeners.attach(b.cm);

		listeners.detachAll();

		expect(listeners.size).toBe(0);
		expect(a.handlers.get("evt")).toHaveLength(0);
		expect(b.handlers.get("evt")).toHaveLength(0);
	});

	it("treats an editor that throws on getInputField as dead", () => {
		const listeners = new CmListeners("evt", () => () => {});
		const broken = {
			getInputField: () => {
				throw new Error("detached");
			},
			on: () => {},
			off: () => {},
		} as unknown as CodeMirrorShim;

		listeners.attach(broken);
		listeners.attach(fakeCm().cm);

		expect(listeners.size).toBe(1);
	});
});
