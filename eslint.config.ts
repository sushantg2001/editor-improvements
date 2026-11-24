import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import project from "./tools/lint/index";

export default defineConfig([
	globalIgnores(["node_modules", "main.js", ".e2e", "tools/live/probes", "tools/live/vault", "src/lua/runtime"]),
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
		// execCommand is the only way to fire the editor's own copy and cut, and keyCode 229
		// is how an input method shows up. Both were checked in a live Obsidian.
		files: ["src/actions/native/index.ts", "src/notation/event.ts", "src/router/dispatch.ts", "test/unit/notation.test.ts"],
		rules: {
			"@typescript-eslint/no-deprecated": "off",
		},
	},
	{
		// The minimum Obsidian version still calls display(), and this tab is small.
		files: ["src/ui/settings-tab.ts"],
		rules: {
			"@typescript-eslint/no-deprecated": "off",
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"obsidianmd/settings-tab/prefer-update-over-display": "off",
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
