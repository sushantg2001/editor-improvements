# Lua API

Your config runs in Lua 5.3, with the `string`, `table`, `math` and `utf8` libraries. It has no access to files, the network or the operating system. A config that runs too long is stopped.

## Keymaps

### `vim.keymap.set(mode, lhs, rhs, opts?)`

Maps a key in the editor.

- **`mode`:** `"n"`, `"i"`, `"v"`, `"x"`, `"o"`, `""` for normal, visual and operator-pending, or a list of these.
- **`lhs`:** the keys to press.
- **`rhs`:** keys to send, or a Lua function. The keys can include [`<Nop>` and `<Cmd>...<CR>`](configuration.md#what-a-mapping-can-send). An empty string is an error, so write `"<Nop>"` for a key that does nothing.
- **`opts.remap`:** whether the keys in `rhs` can trigger other mappings. The default is `false`.
- **`opts.desc`:** a description.
- **`opts.silent`:** accepted, and has no effect.

### `vim.keymap.del(mode, lhs)`

Removes a mapping made earlier in your config.

### `obsidian.keymap.set(context, lhs, rhs, opts?)`

Maps a key anywhere in Obsidian.

- **`context`:** one [context](configuration.md#where-a-mapping-applies), or a list.
- **`rhs`:** an [action](configuration.md#what-a-key-can-do), or a Lua function.
- **`opts.desc`:** a description.
- **`opts.repeatable`:** whether holding the key repeats it. The default is `true` for `keys:` and `native:` actions, and `false` otherwise.

### `obsidian.keymap.del(context, lhs)`

Removes a mapping made earlier in your config.

## Functions as mappings

A function receives one table:

```lua
{ context = "editor", mode = "n", key = "<Space>x", path = "Notes/a.md" }
```

Return `false` to say the mapping does not apply here, and the key carries on as if it were unmapped.

## Options

- **`vim.o.timeoutlen`:** milliseconds to wait for a longer sequence. The default is 1000.
- **`vim.o.strictkeys`:** whether unmapped Ctrl, Alt and Cmd chords do nothing. The default is `true`.
- **`vim.o.<name>`:** any vim option of the engine, such as `ignorecase`, `smartcase` or `hlsearch`.
- **`vim.opt.<name>`:** the same. Read a value with `vim.opt.name:get()`.
- **`vim.g.mapleader`:** the leader key. The default is `\`.
- **`vim.g.<name>`:** your own global values.

## Running things

- **`vim.cmd(text)`:** runs ex commands, one per line.
- **`vim.notify(message, level?)`:** shows a notice. `level` comes from `vim.log.levels`: `TRACE`, `DEBUG`, `INFO`, `WARN` or `ERROR`. `TRACE` and `DEBUG` are not shown.
- **`print(...)`:** shows a notice.
- **`obsidian.command(id)`:** runs an Obsidian command. Returns `true` if it ran, or `false` if it does not apply here.
- **`obsidian.commands()`:** a list of `{ id = ..., name = ... }`.
- **`obsidian.action(id)`:** runs an action now. Returns `"handled"`, `"not-applicable"` or `"error"`.
- **`obsidian.run(id)`:** returns a function that runs the action, to use as a mapping.
- **`obsidian.platform`:** `{ desktop, mobile, os, neovim, version }`.

## Helpers

`vim.trim`, `vim.split`, `vim.startswith`, `vim.endswith`, `vim.tbl_contains`, `vim.tbl_keys`, `vim.tbl_values`, `vim.tbl_extend` and `vim.inspect` work as in Neovim, for their common arguments.

## Modules

`require("a.b")` loads `lua/a/b.lua` or `lua/a/b/init.lua` from your config folder, once.
