// Fails when the built main.js is over the bundle budget. Run after a
// production build: `bun run build && bun run size`.
import { statSync } from "node:fs";

/** The largest main.js allowed, in bytes (1.5 MB, minified). */
export const BUDGET_BYTES = 1_500_000;

/** Returns an error message when `bytes` is over `budget`, otherwise null. */
export function overBudget(bytes: number, budget: number = BUDGET_BYTES): string | null {
	return bytes > budget ? `main.js is ${bytes} bytes, over the budget of ${budget}` : null;
}

if (import.meta.main) {
	const bytes = statSync("main.js").size;
	const error = overBudget(bytes);
	if (error) {
		process.stderr.write(`${error}\n`);
		process.exit(1);
	}
	process.stdout.write(`main.js is ${bytes} bytes, within the budget of ${BUDGET_BYTES}\n`);
}
