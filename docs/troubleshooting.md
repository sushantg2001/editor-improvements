# Troubleshooting

## My keys stopped working

Press **`Ctrl+Alt+Shift+F12`**. This turns on safe mode and gives you Obsidian's own keys back. The status bar shows `SAFE MODE`.

If that chord does nothing, your desktop may be using it. Click the shield icon in the ribbon, or open **Settings**, then **Community plugins**, and turn off **Editor Improvements**.

To leave safe mode, press the chord again.

## A hotkey I set in Obsidian does nothing

While the plugin runs, your config replaces Obsidian's hotkeys. Add the key to your config:

```lua
obsidian.keymap.set("global", "<C-e>", "obsidian:editor:toggle-source")
```

See [how to find a command's id](configuration.md#what-a-key-can-do).

## My config has an error

Your last working keys stay active. Open the plugin's settings to see each error with its file and line. Fix it and save.

If the config was already broken when Obsidian started, the plugin starts in safe mode. Fixing the file and saving turns your keys back on.

## "A mapping is not available"

The mapping points to a command that does not exist right now, usually because its plugin is off or the id has a typo. Your other mappings still work. If the command appears later, the mapping starts working.

## The plugin says it is not active

- **Another plugin is enabled.** Turn off Vim Motions, Vimrc Support, Editor Shortcuts or Vim Tools, then turn this plugin off and on.
- **You chose "Not now".** Open the plugin's settings and select **Set up**.
- **An Obsidian update changed something it needs.** The notice names what. Obsidian's own keys keep working. Please report it.
- **You are on a phone or tablet.** This version is for desktop.

## The plugin is not in the list

- Check that `main.js`, `manifest.json` and `styles.css` are directly inside `plugins/editor-improvements/`, and not in another folder inside it.
- In **Settings**, then **Community plugins**, select **Reload plugins**.
- If Restricted mode is on, turn on community plugins.

## I cannot find the plugins folder

The `.obsidian` folder is hidden on most systems, and a vault can use a different name for it. In **Community plugins**, select **Open plugins folder** to go straight there.

## Built-in vim stayed off after I removed the plugin

If the plugin's files were deleted while Obsidian was closed, it could not put the setting back. Turn **Vim key bindings** back on in Obsidian's settings.

## The build fails

- Check your Bun version with `bun --version`. The project uses 1.4.4.
- Run `bun install --frozen-lockfile` again before `bun run build`.

## Report a problem

[Open a bug report](https://github.com/sushantg2001/editor-improvements/issues/new?template=bug_report.yml) and include:

- the plugin and Obsidian versions
- your operating system and keyboard layout
- what the status bar shows
- the smallest `init.lua` that shows the problem
- what you pressed, where the cursor was, what happened and what you expected

Issues are public, so leave out personal paths, names and note contents. Report security problems [privately](../SECURITY.md).
