import { SuggestModal } from "obsidian";
import type { App } from "obsidian";

/** Asks for a line number between 1 and the line count. */
export class GoToLineModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly lineCount: number,
		private readonly onSubmit: (zeroBasedLine: number) => void,
	) {
		super(app);
		const prompt = `Enter a line number between 1 and ${lineCount}`;
		this.limit = 1;
		this.setPlaceholder(prompt);
		this.emptyStateText = prompt;
	}

	getSuggestions(query: string): string[] {
		const line = Number.parseInt(query, 10);
		return query.length > 0 && line > 0 && line <= this.lineCount ? [query] : [];
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	onChooseSuggestion(value: string): void {
		this.onSubmit(Number.parseInt(value, 10) - 1);
	}
}
