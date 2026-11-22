// The project's own ESLint rules, which keep the module structure honest.
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import type { ESLint, Rule } from "eslint";
import ts from "typescript";
import { mayImport } from "./boundaries";

/** The only module that may import the engine package (ENGINE-R3). */
const FORK_MODULE = "engine/fork";
const ENGINE_PACKAGE = "@saberzero1/codemirror-vim";
/** The only module that may touch Obsidian's undocumented key internals. */
const INTERNALS_MODULE = "router/obsidian-internals";
const INTERNAL_MEMBERS = new Set(["getWindowStack", "prevScopes"]);
const NODE_ONLY = new Set([...builtinModules, "electron", "@electron/remote"]);

/** Splits a linted file into its `src/` folder and its path inside it, or null outside `src/`. */
function locate(filename: string): { src: string; path: string } | null {
	const normal = filename.replaceAll("\\", "/");
	const index = normal.lastIndexOf("/src/");
	if (index < 0) return null;
	return { src: normal.slice(0, index + 4), path: normal.slice(index + 5).replace(/\.tsx?$/, "") };
}

/** The `src/`-relative path of a relative import, or null if it leaves `src/`. */
function resolveImport(src: string, from: string, source: string): string | null {
	if (!source.startsWith(".")) return null;
	const target = relative(src, resolve(src, dirname(from), source)).replaceAll("\\", "/");
	return target.startsWith("..") ? null : target.replace(/\.tsx?$/, "");
}

const isNodeOnly = (source: string): boolean => source.startsWith("node:") || NODE_ONLY.has(source.split("/").slice(0, source.startsWith("@") ? 2 : 1).join("/")) || NODE_ONLY.has(source);
const isDesktopOnly = (path: string): boolean => path === "actions/native/desktop" || path.startsWith("engine/neovim/");

interface ImportNode {
	importKind?: string;
	exportKind?: string;
	source?: { value?: unknown } | null;
	specifiers?: { importKind?: string; exportKind?: string }[];
}

/** True when a declaration brings in types only, so it does not exist at runtime. */
function isTypeOnly(node: ImportNode): boolean {
	if (node.importKind === "type" || node.exportKind === "type") return true;
	const specifiers = node.specifiers ?? [];
	return specifiers.length > 0 && specifiers.every((s) => s.importKind === "type" || s.exportKind === "type");
}

/** Calls `check` for every static import and re-export with a source. */
function onImports(check: (node: Rule.Node, source: string, typeOnly: boolean) => void): Rule.RuleListener {
	const visit = (node: Rule.Node): void => {
		const declaration = node as unknown as ImportNode;
		const value = declaration.source?.value;
		if (typeof value === "string") check(node, value, isTypeOnly(declaration));
	};
	return { ImportDeclaration: visit, ExportNamedDeclaration: visit, ExportAllDeclaration: visit };
}

const moduleBoundaries: Rule.RuleModule = {
	meta: { type: "problem", schema: [], messages: { forbidden: "{{from}} may not import {{to}}." } },
	create(context) {
		const here = locate(context.filename);
		if (!here) return {};
		return onImports((node, source, typeOnly) => {
			const to = resolveImport(here.src, here.path, source);
			if (to !== null && !mayImport(here.path, to, typeOnly)) {
				context.report({ node, messageId: "forbidden", data: { from: here.path, to } });
			}
		});
	},
};

const forkImports: Rule.RuleModule = {
	meta: { type: "problem", schema: [], messages: { forbidden: "Only src/engine/fork.ts may import the engine package." } },
	create(context) {
		const here = locate(context.filename);
		if (!here || here.path === FORK_MODULE) return {};
		const report = (node: Rule.Node, source: string): void => {
			if (source === ENGINE_PACKAGE || source.startsWith(`${ENGINE_PACKAGE}/`)) context.report({ node, messageId: "forbidden" });
		};
		return {
			...onImports((node, source) => report(node, source)),
			ImportExpression(node) {
				const source = node.source;
				if (source.type === "Literal" && typeof source.value === "string") report(node, source.value);
			},
		};
	},
};

const nodeImports: Rule.RuleModule = {
	meta: {
		type: "problem",
		schema: [],
		messages: {
			staticImport: "{{source}} is not available on mobile. Import it dynamically, in a desktop-only module.",
			wrongPlace: "Only src/actions/native/desktop.ts and src/engine/neovim/ may load {{source}}.",
		},
	},
	create(context) {
		const here = locate(context.filename);
		if (!here) return {};
		const dynamic = (node: Rule.Node, source: string): void => {
			if (isNodeOnly(source) && !isDesktopOnly(here.path)) context.report({ node, messageId: "wrongPlace", data: { source } });
		};
		return {
			...onImports((node, source, typeOnly) => {
				if (!typeOnly && isNodeOnly(source)) context.report({ node, messageId: "staticImport", data: { source } });
			}),
			ImportExpression(node) {
				const source = node.source;
				if (source.type === "Literal" && typeof source.value === "string") dynamic(node, source.value);
			},
			CallExpression(node) {
				const [first] = node.arguments;
				if (node.callee.type === "Identifier" && node.callee.name === "require" && first?.type === "Literal" && typeof first.value === "string") {
					dynamic(node, first.value);
				}
			},
		};
	},
};

const obsidianInternals: Rule.RuleModule = {
	meta: { type: "problem", schema: [], messages: { forbidden: "Only src/router/obsidian-internals.ts may touch {{name}}." } },
	create(context) {
		const here = locate(context.filename);
		if (!here || here.path === INTERNALS_MODULE) return {};
		return {
			MemberExpression(node) {
				if (node.computed || node.property.type !== "Identifier") return;
				const name = node.property.name;
				const objectIsScope = node.object.type === "MemberExpression" && !node.object.computed && node.object.property.type === "Identifier" && node.object.property.name === "scope";
				if (INTERNAL_MEMBERS.has(name) || (name === "keys" && objectIsScope)) {
					context.report({ node, messageId: "forbidden", data: { name: name === "keys" ? "scope.keys" : name } });
				}
			},
		};
	},
};

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

/** Reads the runtime import graph of `src/`. Type-only imports do not count. */
function readGraph(src: string): Map<string, string[]> {
	const graph = new Map<string, string[]>();
	for (const file of sourceFiles(src)) {
		const from = relative(src, file).replaceAll("\\", "/").replace(/\.tsx?$/, "");
		const parsed = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
		const targets: string[] = [];
		for (const statement of parsed.statements) {
			let specifier: ts.Expression | undefined;
			if (ts.isImportDeclaration(statement)) {
				const clause = statement.importClause;
				const named = clause?.namedBindings;
				const allTypes = !!clause && !clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
				if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword || allTypes) continue;
				specifier = statement.moduleSpecifier;
			} else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
				specifier = statement.moduleSpecifier;
			}
			if (specifier && ts.isStringLiteral(specifier)) {
				const target = resolveImport(src, from, specifier.text);
				if (target !== null) targets.push(target);
			}
		}
		graph.set(from, targets);
	}
	return graph;
}

function cycleFrom(graph: Map<string, string[]>, start: string): string[] | null {
	const seen = new Set<string>();
	const walk = (node: string, path: string[]): string[] | null => {
		for (const next of graph.get(node) ?? []) {
			if (next === start) return [...path, start];
			if (seen.has(next)) continue;
			seen.add(next);
			const found = walk(next, [...path, next]);
			if (found) return found;
		}
		return null;
	};
	return walk(start, [start]);
}

const graphs = new Map<string, Map<string, string[]>>();

const noCycles: Rule.RuleModule = {
	meta: { type: "problem", schema: [], messages: { cycle: "Import cycle: {{cycle}}." } },
	create(context) {
		const here = locate(context.filename);
		if (!here) return {};
		return {
			Program(node) {
				let graph = graphs.get(here.src);
				if (!graph) {
					graph = readGraph(here.src);
					graphs.set(here.src, graph);
				}
				const cycle = cycleFrom(graph, here.path);
				if (cycle) context.report({ node, messageId: "cycle", data: { cycle: cycle.join(" -> ") } });
			},
		};
	},
};

/** The rules, under the ESLint plugin name `project`. */
const plugin: ESLint.Plugin = {
	rules: {
		"module-boundaries": moduleBoundaries,
		"fork-imports": forkImports,
		"node-imports": nodeImports,
		"obsidian-internals": obsidianInternals,
		"no-cycles": noCycles,
	},
};

export default plugin;
