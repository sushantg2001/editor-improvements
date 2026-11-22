import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["node_modules", "main.js"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
	{
		// Build and release scripts run under Bun in Node, never in Obsidian.
		files: ["tools/**/*.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
]);
