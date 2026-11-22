import { log } from "../diagnostics/log";

/** Every change made to Obsidian, with its undo, in the order made. */
export class Changes {
	private readonly entries: { description: string; undo: () => void }[] = [];

	add(description: string, undo: () => void): void {
		this.entries.push({ description, undo });
	}

	/** Undoes everything, newest first. One failing undo never stops the others. */
	undoAll(): void {
		while (this.entries.length > 0) {
			const entry = this.entries.pop();
			try {
				entry?.undo();
			} catch (error) {
				log("error", "lifecycle", `undo of ${entry?.description}: ${String(error)}`);
			}
		}
	}
}
