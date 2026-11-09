# Vim Tools

Neovim-style editing, navigation and configuration for Obsidian, built on the CodeMirror Vim mode Obsidian already
bundles.

> **Status: early.** The core is in place — see [What works today](#what-works-today). Most feature modules are not
> built yet. Not in the community plugin directory; install manually if you want to try it.

## Why

A working Neovim setup in Obsidian today means stacking four ageing plugins — [Vimrc Support][vimrc],
[Editor Shortcuts][shortcuts], [Jump to Link][jump] and [Pane Relief][relief] — and wiring them together through
`obcommand` string IDs in a vimrc. That arrangement has structural problems:

- **Nothing composes.** Jump to Link registers Obsidian *commands*, not vim motions, so `s` can't be used as
  `ds` or `y<Space>` — the thing you actually want from a jump motion.
- **Nothing reloads.** Vimrc Support reads the vimrc once per session and never unmaps, so editing it needs a
  restart, and disabling the plugin leaves every mapping behind.
- **Nothing knows about vim.** Editor Shortcuts contains no reference to vim at all. Its commands read
  `editor.getSelection()` directly, but CodeMirror's vim drops out of visual mode the moment a command runs — the
  reason both Vimrc Support and Jump to Link keep a `cursorActivity` shadow copy of the selection.
- **Some things can't be bound at all.** *Select all*, *Copy path* and *Paste as plain text* exist only as
  right-click menu items. Obsidian registers no command for them, so there is no hotkey to assign.

Vim Tools replaces all four with one plugin that talks to the Vim API directly.

## Principle: prefer what CodeMirror already does

Obsidian bundles the full [`@replit/codemirror-vim`][cmvim], unminified. Operators, motions, text objects, counts,
registers, macros, marks, `.` repeat, search, `:s`, `:g`, `:sort`, folds and `langmap` all already work.

Vim Tools reimplements none of it. It fills what vim genuinely lacks *in Obsidian*:

| Gap | Filled with |
|---|---|
| Markdown structure | Text objects and motions driven by Obsidian's own `MetadataCache` — headings, list subtrees, callouts, fences, tables — rather than regex line-scanning |
| Window and tab control | `<C-w>` family mapped to native commands where they exist |
| Cross-file jumps | A global jumplist layered over native `leaf.history` |
| Label motions | Hop / flash exposed as **motions**, so they compose with operators |
| Surround, comment, reflow | Real operators, so counts and dot-repeat work |
| `scrolloff`, `relativenumber` | CodeMirror 6 extensions (`EditorView.scrollMargins`, `lineNumbers`) |
| Unbindable menu items | Every context-menu item catalogued and given a command |

## What works today

- **Vim API bridge** — resolves `window.CodeMirrorAdapter.Vim`, waits for vim mode and the first editor, and
  re-initialises when vim mode is toggled mid-session.
- **Action registry** — one definition yields a vim motion/action/operator, an `:exCommand`, a key binding and an
  Obsidian command.
- **Mapping ledger** — every key handed to vim is recorded so it can be handed back. Disabling the plugin restores
  stock vim with no reload and no leaked mappings.
- **Command surface** — every action gets a palette entry and a hotkey slot in Settings → Hotkeys.
- **Selection service** — keeps a shadow copy of the selection so a command still sees it after vim has dropped
  out of visual mode.
- **Motions that compose.** A motion bound only to the `normal` context is invisible to operators, because
  CodeMirror rewrites the context to `operatorPending` while `d`/`y`/`c` wait. Bindings are mirrored
  automatically, so `d{motion}` works — verified against the real vim addon.
- **Scripts engine** — `init.js` and friends, hot-reloaded on save, with per-script teardown and errors
  attributed by filename and line.
- **Mode indicator** in the status bar, with configurable labels.
- **Three actions** filling the unbindable gap above: `Select all`, `Copy path`, `Paste as plain text`.

`editor:copy`, `editor:cut` and `editor:paste` are deliberately *not* duplicated — they already exist and are
already bindable.

## Roadmap

| Phase | | |
|---|---|---|
| 0 | Scaffold, vim bridge, mode tracking | ✅ |
| 1 | Registry, command surface, mapping ledger, selection service | ✅ |
| 2 | Scripts engine and public API | ✅ |
| 3 | Editor Shortcuts port — all 42 commands, made vim-aware | |
| 4 | vimrc → `init.js` converter | |
| 5 | Context menu catalogue | |
| 6 | Structure service, text objects, structural motions | |
| 7 | Operators and hop motions | |
| 8 | Panes, tabs, ex commands, global jumplist and marks | |
| 9 | CodeMirror options — scrolloff, relativenumber, cursorline, yank flash | |
| 10 | Sidebar adapters | |

## Configuration

Configuration is JavaScript, not a vimrc. Scripts live in `<config-dir>/vim-tools/` (`.obsidian/vim-tools` unless
you renamed your config folder), with `init.js` loaded first and the rest in lexical order, the way Neovim loads
`plugin/`.

Run **Vim Tools: Create scripts folder with a starter init.js** from the palette to get a commented starting point
plus a `vim-tools.d.ts` for editor autocomplete, then enable scripts in settings.

```js
// .obsidian/vim-tools/init.js

vim.leader(' ');

// Plain remaps, exactly as in a vimrc.
vim.inoremap('jk', '<Esc>');
vim.nnoremap('H', '^');
vim.nnoremap('L', '$');

// Any Obsidian command. Find ids in Settings → Hotkeys.
vim.action('openToday', () => vim.obcommand('daily-notes'), { needsEditor: false });
vim.nmap('<leader>d', 'openToday');

// A motion returns a position, so it composes with operators: dgL, ygL, cgL.
vim.motion('toLastLine', (ctx) => ({ line: ctx.editor.lastLine(), ch: 0 }));
vim.nmap('gL', 'toLastLine');
```

The `nmap` family is recursive and `nnoremap` non-recursive, as in vim. A right-hand side naming one of your
actions binds to it; anything else is passed to vim as an ordinary remap.

Anything you define also becomes an Obsidian command, so it gets a hotkey slot in Settings → Hotkeys for free.

Saving a script reloads it — no restart. A script that throws is reported with its filename and line, leaves
nothing half-applied, and does not stop the others from loading.

Scripts are **opt-in**. They are arbitrary code read from your vault, and a synced vault runs them on every
device. See [SECURITY.md](SECURITY.md).

A one-shot converter will translate an existing `.obsidian.vimrc` into `init.js` (phase 4), reporting anything it
could not translate rather than guessing.

## Installation

Manual, until this is directory-listed:

1. Build (see below), or download `main.js`, `manifest.json` and `styles.css` from a release.
2. Drop them in `<vault>/.obsidian/plugins/vim-tools/`.
3. Enable **Vim Tools** in Settings → Community plugins.
4. Enable vim mode in **Settings → Editor** — the plugin does nothing without it.

## Development

```bash
bun install
bun run test
bun run lint
bun run build
```

For a live loop against a real vault, point the dev build straight at the plugin folder:

```bash
OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/vim-tools" bun run dev
```

That writes `main.js` and copies `manifest.json` and `styles.css` on every rebuild.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, commit and release process.

Design notes, including the survey of the other vim plugins and the CodeMirror 6 primitives in play, are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Related work

[**Vim Motions**][motions] is a far more complete plugin in this space — Lua configuration via fengari, a
Telescope-style picker, oil.nvim, harpoon, snippets, an undo tree. If you want maximum capability today, use that.

Vim Tools is smaller and takes one deliberately different bet: Markdown structure comes from Obsidian's
`MetadataCache` rather than regex scanning, which gets fences inside blockquotes, setext headings, aliased
wikilinks and nested list hierarchy right by construction. It also stays on Obsidian's bundled vim rather than
shipping a fork.

Also worth knowing about: [vim-im-select][imselect] and [vim-im-switch][imswitch] (IME switching),
[vim-yank-highlight][yank], [vim-reading-view-navigation][reading], and [cm-chs-patch][chs] (CJK word boundaries).

## License

MIT

[vimrc]: https://github.com/esm7/obsidian-vimrc-support
[shortcuts]: https://github.com/timhor/obsidian-editor-shortcuts
[jump]: https://github.com/mrjackphil/obsidian-jump-to-link
[relief]: https://github.com/pjeby/pane-relief
[cmvim]: https://github.com/replit/codemirror-vim
[motions]: https://github.com/saberzero1/motions
[imselect]: https://github.com/ALONELUR/vim-im-select-obsidian
[imswitch]: https://github.com/yuanotes/obsidian-vim-im-switch-plugin
[yank]: https://github.com/kometenstaub/obsidian-vim-yank-highlight
[reading]: https://github.com/kometenstaub/obsidian-vim-reading-view-navigation
[chs]: https://github.com/aidenlx/cm-chs-patch
