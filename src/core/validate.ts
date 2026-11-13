import { RESERVED_COMMAND_IDS } from "../constants";
import { describeKeysProblem } from "./keys";
import type { Contribution } from "./registry";
import type { BindingContext } from "../types";

const ACTION_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const KINDS = new Set(["action", "motion", "operator"]);
const CONTEXTS = new Set<BindingContext>(["normal", "visual", "insert", "operatorPending"]);

/**
 * Checks one source's contribution and returns every problem found.
 *
 * Used on every module in the contract test, and on every script at load, so
 * the same rules hold for built-in and user-written actions. Returns messages
 * rather than throwing, so a caller can report all of them at once.
 */
export function validateContribution(contribution: Contribution): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();

	for (const action of contribution.actions ?? []) {
		const label = `action "${action.id}"`;
		if (!ACTION_ID.test(action.id)) {
			problems.push(
				`${label}: ids start with a letter and use only letters, digits, "_" and "-"`,
			);
		}
		if (action.command !== false && RESERVED_COMMAND_IDS.includes(action.id)) {
			// Obsidian would let this replace the plugin's own command of that name.
			problems.push(
				`${label}: this id belongs to a command of the plugin; pick another or pass { command: false }`,
			);
		}
		if (seen.has(action.id)) {
			problems.push(`${label}: defined more than once`);
		}
		seen.add(action.id);
		if (!action.name.trim()) {
			problems.push(`${label}: needs a name for the command palette`);
		}
		if (!action.group.trim()) {
			problems.push(`${label}: needs a group for the command palette`);
		}
		if (!KINDS.has(action.kind)) {
			problems.push(`${label}: unknown kind "${String(action.kind)}"`);
		}
		if (typeof action.run !== "function") {
			problems.push(`${label}: run is not a function`);
		}
		for (const binding of action.defaultKeys ?? []) {
			problems.push(...bindingProblems(label, binding.keys, binding.contexts));
		}
	}

	for (const binding of contribution.bindings ?? []) {
		const label = `binding "${binding.keys}"`;
		problems.push(...bindingProblems(label, binding.keys, binding.contexts));
		if (binding.target.kind === "keys" && binding.target.rhs.length === 0) {
			problems.push(`${label}: the right-hand side is empty`);
		}
	}

	for (const unmap of contribution.unmaps ?? []) {
		const problem = describeKeysProblem(unmap.keys);
		if (problem) {
			problems.push(`unmap "${unmap.keys}": ${problem}`);
		}
	}

	return problems;
}

function bindingProblems(label: string, keys: string, contexts: BindingContext[]): string[] {
	const problems: string[] = [];
	const keyProblem = describeKeysProblem(keys);
	if (keyProblem) {
		problems.push(`${label}: ${keyProblem}`);
	}
	if (contexts.length === 0) {
		problems.push(`${label}: no context to bind in`);
	}
	for (const context of contexts) {
		if (!CONTEXTS.has(context)) {
			problems.push(`${label}: unknown context "${String(context)}"`);
		}
	}
	return problems;
}
