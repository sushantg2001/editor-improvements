const LIMIT = 5;
const WINDOW_MS = 10_000;

/** Counts errors. More than five in ten seconds means something is badly wrong. */
export class ErrorBudget {
	private times: number[] = [];

	/** Records one error. Returns true when the budget is spent. */
	record(now = Date.now()): boolean {
		this.times = this.times.filter((time) => now - time < WINDOW_MS);
		this.times.push(now);
		return this.times.length > LIMIT;
	}

	reset(): void {
		this.times = [];
	}
}
