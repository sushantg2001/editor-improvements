import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import project from "./tools/lint/index";

export default defineConfig([
	globalIgnores(["node_modules", "main.js", ".e2e", "tools/live/probes", "tools/live/vault"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
	{
		files: ["src/**/*.ts"],
		plugins: { project },
		rules: {
			"project/module-boundaries": "error",
			"project/fork-imports": "error",
			"project/node-imports": "error",
			"project/obsidian-internals": "error",
			"project/no-cycles": "error",
		},
	},
	{
		// Build, release and test tooling runs under Bun, never in Obsidian.
		files: ["tools/**/*.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/prefer-window-timers": "off",
			"obsidianmd/hardcoded-config-path": "off",
			"no-restricted-globals": "off",
		},
	},
]);
