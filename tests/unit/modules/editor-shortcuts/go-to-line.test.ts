import { describe, expect, it, vi } from "vitest";

import { GoToLineModal } from "../../../../src/modules/editor-shortcuts/go-to-line";
import { App } from "../../../mocks/obsidian";

function modal(lineCount = 10, onSubmit = vi.fn()) {
	return { modal: new GoToLineModal(new App() as never, lineCount, onSubmit), onSubmit };
}

describe("GoToLineModal", () => {
	it("tells the user the valid range", () => {
		// `placeholder` is recorded by the test double for `setPlaceholder`.
		const m = modal(42).modal as unknown as { placeholder: string; emptyStateText: string; limit: number };

		expect(m.placeholder).toBe("Enter a line number between 1 and 42");
		expect(m.emptyStateText).toBe(m.placeholder);
		expect(m.limit).toBe(1);
	});

	it.each(["1", "10", "007"])("offers %s as a valid line", (query) => {
		expect(modal(10).modal.getSuggestions(query)).toEqual([query]);
	});

	it.each(["", "0", "11", "-3", "abc"])("offers nothing for %j", (query) => {
		expect(modal(10).modal.getSuggestions(query)).toEqual([]);
	});

	it("hands back a zero-based line when one is chosen", () => {
		const { modal: m, onSubmit } = modal(10);

		m.onChooseSuggestion("4");

		expect(onSubmit).toHaveBeenCalledWith(3);
	});

	it("renders the suggestion as text", () => {
		const el = document.createElement("div");

		modal().modal.renderSuggestion("7", el);

		expect(el.textContent).toBe("7");
	});
});
