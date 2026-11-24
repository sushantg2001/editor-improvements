# Install

There is no published release yet, so you build the plugin from source. Try it in a test vault first, because it replaces Obsidian's hotkeys.

## What you need

- Obsidian 1.15.0 or newer, on desktop
- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/) 1.4.4

Turn off these plugins first, because they also take over keys: Vim Motions, Vimrc Support and Editor Shortcuts.

## Install

1. Build the plugin:

   ```bash
   git clone https://github.com/sushantg2001/editor-improvements.git
   cd editor-improvements
   bun install --frozen-lockfile
   bun run build
   ```

2. In Obsidian, open **Settings** and then **Community plugins**. If Restricted mode is on, turn on community plugins.
3. Next to **Installed plugins**, select **Open plugins folder**.
4. In that folder, create a folder named `editor-improvements`.
5. Copy `main.js`, `manifest.json` and `styles.css` from the folder you built into the new folder.
6. Back in Obsidian, select **Reload plugins**.
7. Under **Installed plugins**, turn on **Editor Improvements**.
8. Read the prompt and select **Set up**.

Setup creates a starter config, turns off Obsidian's built-in vim mode, and replaces Obsidian's hotkeys with the keys in your config. If you select **Not now**, nothing changes. You can set up later from the plugin's settings.

## Check that it worked

Open a note. The status bar shows `NORMAL`. Press `i` and it shows `INSERT`, then press `Esc`. Press `Ctrl+P` to open the command palette.

Next, [make the keys your own](configuration.md).

## Phones and tablets

This version is for desktop. On a phone or tablet the plugin stays inactive and changes nothing.

## Update

1. In the folder you cloned, run:

   ```bash
   git pull
   bun install --frozen-lockfile
   bun run build
   ```

2. Copy `main.js`, `manifest.json` and `styles.css` over the installed files.
3. In **Community plugins**, turn **Editor Improvements** off and on again.

## Remove

1. In **Community plugins**, turn off **Editor Improvements**. Your hotkeys and your built-in vim setting come back at once.
2. Select **Uninstall**. Obsidian deletes the plugin's folder.

Your notes are not affected. Your config stays in `.obsidian/editor-improvements/` until you delete it.
