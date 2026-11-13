# Architecture

## Principle

Obsidian bundles its own copy of CodeMirror's vim mode, a fork of the code
[`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) is built on. Operators, motions, text objects,
counts, registers, macros, marks, `.` repeat, search, `:s`, `:g`, `:sort`, folds and `langmap` already work. Editor
Improvements reimplements none of it and fills only what vim lacks *inside Obsidian*. The tests run against the npm
package and have been run against Obsidian's copy too; the one difference that matters is described at
`stateAtVimCursor` in `src/modules/editor-shortcuts/index.ts`.

| Gap | Filled with | Status |
|---|---|---|
| Editor Shortcuts commands | All 46, as motions and actions that know about vim | Done |
| Configuration | `init.js` scripts and their API | Done |
| Unbindable menu items | Every context-menu item given a command | Three so far: Select all, Copy path, Paste as plain text |
| Markdown structure | Text objects and motions driven by Obsidian's `MetadataCache` rather than regex line-scanning | Planned |
| Window and tab control | The `<C-w>` family mapped to native commands | Planned |
| Cross-file jumps | A global jumplist layered over native `leaf.history` | Planned |
| Label motions | Hop and flash exposed as motions, so they compose with operators | Planned |
| Surround, comment, reflow | Real operators, so counts and dot-repeat work | Planned |
| `scrolloff`, `relativenumber` | CodeMirror 6 extensions | Planned |

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

**Runtime.** `EditorImprovementsRuntime` is the only thing that projects the registry onto the outside world. It re-derives
vim's keymap and Obsidian's command palette whenever the registry changes or vim becomes available.

**Dispatcher.** CodeMirror's vim cannot undefine a name, so each action id gets one stub that looks the action up
in the registry on every call. Bodies are hot-swappable while the stub stays put.

**Mapping ledger.** Every key handed to vim is recorded so exactly those keys can be handed back on disable. The exception is a built-in key a script freed with `unmap`: vim has no way to put one back, so it stays free until Obsidian restarts.

**Motions and operators.** A motion bound only to `normal` is invisible to `d`/`y`/`c`, because CodeMirror rewrites
the context to `operatorPending` while an operator waits. The keymap mirrors motion bindings into that context.

**Key names.** The Vim addon names a key event before looking for a mapping (`<Space>`, `<CR>`, `<C-h>`) and
compares a plain remap with that name as written. Script keys are rewritten to those names first, so `<cr>`,
`<Enter>` and a literal space all work (`src/core/keys.ts`).

**Dot repeat.** Vim's `.` repeats only commands registered as edits. An action sets `isEdit` when it changes the
document, and the keymap passes that on, so `.` repeats it. Motions and selections leave it off.
