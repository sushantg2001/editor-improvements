# Install

There is no published release yet, so you build the plugin from source. Try it in a test vault first.

## What you need

- Obsidian 1.15.0 or newer
- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/) 1.4.4

## Install on desktop

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
5. Copy `main.js` and `manifest.json` from the folder you built into the new folder.
6. Back in Obsidian, select **Reload plugins**.
7. Under **Installed plugins**, turn on **Editor Improvements**.

## Check that it worked

**Editor Improvements** appears under **Installed plugins**, and its switch stays on. Obsidian shows no error.

The plugin has no visible features yet. See [what it does today](what-it-does.md).

## Install on a phone or tablet

Copy the same two files into `.obsidian/plugins/editor-improvements/` in your vault, using any tool that can reach it. Then follow steps 6 and 7.

The plugin has been tested only in Obsidian's mobile emulation, not on a real phone or tablet.

## Update

1. In the folder you cloned, run:

   ```bash
   git pull
   bun install --frozen-lockfile
   bun run build
   ```

2. Copy `main.js` and `manifest.json` over the installed files.
3. In **Community plugins**, turn **Editor Improvements** off and on again.

## Remove

1. In **Community plugins**, turn off **Editor Improvements**.
2. Select **Uninstall**. Obsidian deletes the plugin's folder.

Your notes are not affected.
