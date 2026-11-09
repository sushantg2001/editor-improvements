# Architecture

## Principle

Obsidian bundles the full [`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim). Operators, motions,
text objects, counts, registers, macros, marks, `.` repeat, search, `:s`, `:g`, `:sort`, folds and `langmap` already
work. Vim Tools reimplements none of it and fills only what vim lacks *inside Obsidian*:

| Gap | Filled with |
|---|---|
| Markdown structure | Text objects and motions driven by Obsidian's `MetadataCache` rather than regex line-scanning |
| Window and tab control | The `<C-w>` family mapped to native commands |
| Cross-file jumps | A global jumplist layered over native `leaf.history` |
| Label motions | Hop and flash exposed as motions, so they compose with operators |
| Surround, comment, reflow | Real operators, so counts and dot-repeat work |
| `scrolloff`, `relativenumber` | CodeMirror 6 extensions |
| Unbindable menu items | Every context-menu item catalogued and given a command |

## Shape of the code

```
src/
  main.ts          wiring only
  types.ts         shared types
  core/            registry, dispatch, keymap ledger, command surface, vim bridge
  modules/         feature modules, each one a Contribution
  scripts/         the init.js engine and its API
  ui/              status bar
```

**Modules.** A feature is a `FeatureModule`: one file in `src/modules/` and one line in `src/modules/index.ts`.
`ModuleHost` starts each one and hands what it contributes to the registry in a single batch, so `main.ts` never
changes when a feature is added. A contract test checks every listed module. See [CONTRIBUTING.md](../CONTRIBUTING.md).

**Registry.** `ActionRegistry` is the single source of truth. Every source (a built-in module, or one script file)
contributes actions and bindings, and re-setting a source replaces everything it contributed. Reload is therefore
atomic and has no separate teardown path.

**Runtime.** `VimToolsRuntime` is the only thing that projects the registry onto the outside world. It re-derives
vim's keymap and Obsidian's command palette whenever the registry changes or vim becomes available.

**Dispatcher.** CodeMirror's vim cannot undefine a name, so each action id gets one stub that looks the action up
in the registry on every call. Bodies are hot-swappable while the stub stays put.

**Mapping ledger.** Every key handed to vim is recorded so exactly those keys can be handed back on disable.

**Motions and operators.** A motion bound only to `normal` is invisible to `d`/`y`/`c`, because CodeMirror rewrites
the context to `operatorPending` while an operator waits. The keymap mirrors motion bindings into that context.

**Key names.** The Vim addon names a key event before looking for a mapping (`<Space>`, `<CR>`, `<C-h>`) and
compares a plain remap with that name as written. Script keys are rewritten to those names first, so `<cr>`,
`<Enter>` and a literal space all work (`src/core/keys.ts`).

**Dot repeat.** Vim's `.` repeats only commands registered as edits. An action sets `isEdit` when it changes the
document, and the keymap passes that on, so `.` repeats it. Motions and selections leave it off.
