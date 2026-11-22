# Troubleshooting

## The plugin is not in the list

- Check that `main.js` and `manifest.json` are directly inside `plugins/editor-improvements/`, and not in another folder inside it.
- In **Settings**, then **Community plugins**, select **Reload plugins**.
- If Restricted mode is on, turn on community plugins.

## I cannot find the plugins folder

The `.obsidian` folder is hidden on most systems, and a vault can use a different name for it. In **Community plugins**, select **Open plugins folder** to go straight there.

## Obsidian says the plugin failed to load

1. Check that you are on Obsidian 1.15.0 or newer. Your version is under **Settings**, then **General**.
2. Build the plugin again and copy both files again. See [Install](install.md).
3. Turn the plugin off and on.

If it still fails, report it.

## The build fails

- Check your Bun version with `bun --version`. The project uses 1.4.4.
- Run `bun install --frozen-lockfile` again before `bun run build`.

## Something else changed after I turned it on

Turn the plugin off and see whether the problem goes away. The plugin should not change anything yet, so if it does, please report it.

## Report a problem

[Open a bug report](https://github.com/sushantg2001/editor-improvements/issues/new?template=bug_report.yml) and include:

- the plugin and Obsidian versions
- your operating system, desktop or mobile, and keyboard layout
- what you pressed, where the cursor was, what happened and what you expected

Issues are public, so leave out personal paths, names and note contents. Report security problems [privately](../SECURITY.md).
