# Editor Improvements

Neovim-style editing for Obsidian, built on the CodeMirror Vim mode Obsidian already bundles. One plugin in place of
Vimrc Support, Editor Shortcuts, Jump to Link and Pane Relief.

Not in the community plugin directory yet.

## Install

**BRAT:** add `sushantg2001/editor-improvements` as a beta plugin.

**Manual:** download `main.js`, `manifest.json` and `styles.css` from a [release][releases] into
`<vault>/.obsidian/plugins/editor-improvements/`.

Then enable **Editor Improvements** in Settings → Community plugins and turn on vim mode in Settings → Editor. The plugin does
nothing without it.

## Configure

Configuration is JavaScript. Scripts live in `<vault>/.obsidian/editor-improvements/`, `init.js` first and the rest in
lexical order. Saving a script reloads it, and a script that throws is reported with its file and line without
stopping the others.

Run **Editor Improvements: Create scripts folder with a starter init.js** from the command palette, then turn on
**Run scripts from the vault** in the plugin settings. Scripts are off by default because they are arbitrary code
that a synced vault runs on every device. See [SECURITY.md](SECURITY.md).

```js
vim.leader(" ");

vim.inoremap("jk", "<Esc>");
vim.nnoremap("H", "^");

// Any Obsidian command. Find ids in Settings → Hotkeys.
vim.action("openToday", () => vim.obcommand("daily-notes"), { needsEditor: false });
vim.nmap("<leader>d", "openToday");

// A motion returns a position, so it composes with operators: dgL, ygL, cgL.
vim.motion("toLastLine", (ctx) => ({ line: ctx.editor.lastLine(), ch: 0 }));
vim.nmap("gL", "toLastLine");
```

`nmap` is recursive and `nnoremap` is not, as in vim. A right-hand side that names one of your actions binds to it;
anything else is passed to vim as an ordinary remap. Every action and motion also becomes an Obsidian command, so it gets a
hotkey slot in Settings → Hotkeys. Operators do not, since they need a motion to act on; pass `{ command: true }` to
force one.

`vim.nunmap("S")` (also `vunmap`, `iunmap`, `ounmap` and `unmap`) removes a built-in binding so the key can start a
longer mapping, like `Sl`. Unlike a mapping it is not undone when you edit the script: the key stays free until
Obsidian restarts.

## What it does

- Reads the Vim API Obsidian already exposes, and re-attaches when vim mode is toggled.
- Keeps every key it maps on a ledger, so disabling the plugin restores stock vim with no reload.
- Lets motions compose with operators, so `d{motion}` works for your own motions.
- Shows the vim mode in the status bar.
- Adds `Select all`, `Copy path` and `Paste as plain text`, which Obsidian offers only in right-click menus.
- Includes every [Editor Shortcuts][shortcuts] command as a vim motion or action, so `d` + a movement key works
  and a count repeats it. See [docs/editor-shortcuts.md](docs/editor-shortcuts.md).

How the pieces fit is in [docs/architecture.md](docs/architecture.md).

## Development

```bash
bun install
bun run ci     # lint, test, build
```

To rebuild straight into a vault while you work:

```bash
OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/editor-improvements" bun run dev
```

Branches, commits and releases are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

[releases]: https://github.com/sushantg2001/editor-improvements/releases
[shortcuts]: https://github.com/timhor/obsidian-editor-shortcuts
