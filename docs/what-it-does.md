# What it does

While the plugin runs, your Lua config decides what every key does, everywhere in Obsidian.

## What changes when you set it up

- **Obsidian's hotkeys are off.** Your config replaces them. The starter config maps the common ones, such as the command palette, quick switcher, save, tabs, copy and paste. Hotkeys you set in Obsidian's settings do nothing until you add them to your config.
- **Obsidian's built-in vim mode is off.** The plugin brings its own vim engine, which works in notes, table cells and canvas cards.
- **Unmapped Ctrl, Alt and Cmd chords do nothing** in insert mode and in panes such as the file explorer, so nothing happens that you did not ask for. You can [turn this off](configuration.md#options).

Turning the plugin off puts all of this back.

## What you get

- **Mappings for every place:** a key can mean one thing in a note and another in the file explorer or a modal.
- **Key sequences:** such as `<Space>f`, with a leader key.
- **Any action:** vim keys, ex commands, Obsidian commands, copy, cut, paste, undo, redo, select all and Lua functions.
- **Live reload:** save your config and it applies. If it has an error, your last working keys stay in place.
- **Status bar:** shows the vim mode, or the keys you are in the middle of. Click it for reload, safe mode and your config.

## Safe mode

Safe mode gives you Obsidian's own keys back while the plugin stays installed. Vim keeps working in your notes.

- **Press `Ctrl+Alt+Shift+F12`** to turn it on or off, from anywhere. This chord cannot be remapped.
- You can also use the shield icon in the ribbon, the status bar menu, the plugin's settings, or the command palette.
- It stays on after a restart until you turn it off.

The plugin enters safe mode by itself if your config cannot load on startup, or if many errors happen in a few seconds.

## Your privacy

The plugin makes no network requests. It reads only your config folder, and writes there only when you agree to create the starter config. Your config runs in a Lua sandbox with no access to files, the network or the operating system.

## Where it has been tested

- **Obsidian:** 1.15.1. The minimum version is 1.15.0.
- **Linux:** tested with KDE Plasma.
- **macOS and Windows:** not tested yet.
- **Phones and tablets:** not supported in this version. The plugin stays inactive there.
