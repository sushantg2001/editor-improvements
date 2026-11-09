import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/prefer-instanceof': 'off',
			'obsidianmd/no-tfile-tfolder-cast': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			'@typescript-eslint/no-restricted-imports': 'off',
			// `expect(spy.method)` is the normal way to assert on a mock; the
			// rule's unbound-`this` concern does not apply to those.
			'@typescript-eslint/unbound-method': 'off',
			// Tests build fixtures with literal paths and use globalThis to
			// observe what evaluated scripts did; neither applies to a vault.
			'obsidianmd/hardcoded-config-path': 'off',
			'obsidianmd/no-global-this': 'off',
		},
	},
);
