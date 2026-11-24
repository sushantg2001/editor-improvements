# Configure your keys

Your config is a Lua file, `.obsidian/editor-improvements/init.lua` in your vault. To open it, click the mode in the status bar and select **Open config**. Saving it applies your changes.

You can move the folder in the plugin's settings.

## A first config

```lua
vim.g.mapleader = " "

-- Open the command palette from anywhere
obsidian.keymap.set("global", "<C-p>", "obsidian:command-palette:open")

-- Move by visual lines
vim.keymap.set("n", "j", "gj")
vim.keymap.set("n", "k", "gk")

-- Leave insert mode with jk
vim.keymap.set("i", "jk", "<Esc>")

-- Space then f finds a note
vim.keymap.set("n", "<leader>f", obsidian.run("obsidian:switcher:open"), { desc = "Find a note" })

-- Your own function
vim.keymap.set("n", "<leader>w", function(ctx)
	obsidian.command("editor:save-file")
	vim.notify("Saved " .. ctx.path)
end)
```

## Two ways to map a key

- **`vim.keymap.set`** works like Neovim, for keys in an editor. Use it for vim behaviour.
- **`obsidian.keymap.set`** works anywhere in Obsidian. Use it for commands and for keys outside the editor.

## How to write keys

| You write | Key |
| --- | --- |
| `a`, `A`, `?` | That character |
| `<CR>`, `<Esc>`, `<Tab>`, `<BS>`, `<Del>`, `<Space>` | Enter, Escape, Tab, Backspace, Delete, Space |
| `<Up>`, `<Down>`, `<Left>`, `<Right>` | Arrow keys |
| `<Home>`, `<End>`, `<PageUp>`, `<PageDown>`, `<Insert>` | Navigation keys |
| `<F1>` to `<F24>` | Function keys |
| `<C-c>` | Ctrl+C |
| `<A-x>` or `<M-x>` | Alt+X, or Option+X on macOS |
| `<D-s>` | Cmd+S on macOS, Super+S elsewhere |
| `<C-S-Tab>` | Ctrl+Shift+Tab |
| `<lt>`, `<Bslash>`, `<Bar>` | `<`, `\`, `\|` |
| `<leader>x` | Your leader key, then X |

Names are not case-sensitive, but letters are: `<C-A>` means Ctrl+Shift+A.

Set `vim.g.mapleader` before the mappings that use it. The default leader is `\`.

A `<Name>` that is not a key, such as `<Foo>`, is read as the text `<Foo>`, as in Neovim. Your config still loads, and a notice names the key, since this is usually a typo. Write `<lt>Foo>` when you mean the text.

## What a mapping can send

The right-hand side of `vim.keymap.set` and a `keys:` action can also use these.

| You write | What it does |
| --- | --- |
| `<Nop>` | Nothing. `vim.keymap.set("n", "Z", "<Nop>")` turns `Z` off. |
| `<Cmd>nohlsearch<CR>` | Runs an ex command without typing `:`. Normal and insert mode stay as they are. |
| `<Ignore>` | Nothing. It is skipped. |
| `<lt>` | The `<` key, in every mode, in `:` and `/` prompts, and after `r`, `f` or `t`. |
| `<Plug>(name)` | A mapping named `<Plug>(name)`. It is reached even when `remap` is off. |

```lua
-- Clear the search highlight with Escape
vim.keymap.set("n", "<Esc>", "<Cmd>nohlsearch<CR>")

-- Surround the word under the cursor with < and >
vim.keymap.set("n", "<leader>s", "ciw<lt>><Esc>P")
```

Between `<Cmd>` and `<CR>` write plain text. `<lt>`, `<Bar>`, `<Bslash>` and `<Space>` stand for their characters, and other keys are an error. Keys can come before and after it: `<Cmd>nohlsearch<CR><Esc>`. In visual mode, the command ends visual mode, as `:` does.

## Where a mapping applies

The first argument of `obsidian.keymap.set` is a context, or a list of them.

| Context | Where |
| --- | --- |
| `global` | Everywhere, unless something more specific matches |
| `editor` | Any note, table cell or canvas card |
| `editor:n`, `editor:i`, `editor:v`, `editor:x`, `editor:o`, `editor:R`, `editor:c` | The editor in normal, insert, visual, line or block visual, operator-pending, replace or command-line mode |
| `input` | A text field, such as search or a rename box |
| `modal` | A dialog, such as the command palette |
| `transient` | A menu or other short-lived popup |
| `view:file-explorer`, `view:graph`, `view:canvas`, `view:pdf`, `view:search`, `view:outline` | That kind of pane |

The most specific match wins. In a note in normal mode, the plugin looks in `editor:n`, then `editor`, then `global`.

## What a key can do

Pass one of these as the third argument of `obsidian.keymap.set`.

| Action | What it does |
| --- | --- |
| `obsidian:<id>` | Runs an Obsidian command, such as `obsidian:app:open-settings` |
| `keys:<keys>` | Sends keys to vim, such as `keys:gg`. It can use [`<Cmd>` and `<Nop>`](#what-a-mapping-can-send). |
| `ex:<command>` | Runs a vim ex command, such as `ex:nohlsearch` |
| `native:copy`, `native:cut`, `native:paste` | Clipboard |
| `native:paste-plain` | Pastes as plain text |
| `native:undo`, `native:redo` | History |
| `native:select-all` | Selects everything |
| `plugin:reload` | Reloads your config |
| `plugin:safe-mode` | Turns safe mode on or off |
| `plugin:open-config` | Opens your config |
| A Lua function | Runs your function |

To find a command's id, run this once and read the notice:

```lua
for _, command in ipairs(obsidian.commands()) do
	if command.name:find("Split") then vim.notify(command.id) end
end
```

## Options

```lua
vim.o.timeoutlen = 500     -- ms to wait when a key could start a longer sequence
vim.o.strictkeys = false   -- let unmapped Ctrl, Alt and Cmd chords through
vim.o.ignorecase = true    -- vim options work too
vim.o.smartcase = true
```

## Split your config into files

`require("keys")` loads `lua/keys.lua` inside your config folder. `require("a.b")` loads `lua/a/b.lua` or `lua/a/b/init.lua`.

## When your config has an error

Your last working keys stay active. A notice shows the file and line, and the plugin's settings list every error. Fix the file and save.

See the full [Lua API](lua-api.md).
