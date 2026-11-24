import type { Key, KeySeq } from "../notation/parse";
import type { RouterMapping } from "./router";

export interface TrieNode {
	next: Map<Key, TrieNode>;
	mapping: RouterMapping | null;
}

export type Tries = Map<string, TrieNode>;

const node = (): TrieNode => ({ next: new Map(), mapping: null });

/** Builds one trie per context. A later mapping replaces an earlier one. */
export function compileTries(mappings: RouterMapping[]): Tries {
	const tries: Tries = new Map();
	for (const mapping of mappings) {
		let current: TrieNode | undefined = tries.get(mapping.context);
		if (!current) {
			current = node();
			tries.set(mapping.context, current);
		}
		for (const key of mapping.keys) {
			let next: TrieNode | undefined = current.next.get(key);
			if (!next) {
				next = node();
				current.next.set(key, next);
			}
			current = next;
		}
		current.mapping = mapping;
	}
	return tries;
}

export interface Lookup {
	mapping: RouterMapping | null;
	prefix: boolean;
}

/** Looks up keys along a chain of contexts, the most specific first. */
export function lookup(tries: Tries, chain: readonly string[], keys: KeySeq): Lookup {
	let mapping: RouterMapping | null = null;
	let prefix = false;
	for (const context of chain) {
		let current = tries.get(context);
		for (const key of keys) {
			current = current?.next.get(key);
			if (!current) break;
		}
		if (!current) continue;
		mapping ??= current.mapping;
		if (current.next.size > 0) prefix = true;
	}
	return { mapping, prefix };
}
