# Editor Shortcuts commands

Editor Improvements includes every command from [Editor Shortcuts][upstream] (46 of them), reimplemented to work with vim. The
ids and names are unchanged, so moving from the old plugin is a prefix swap: `obsidian-editor-shortcuts:insertLineBelow`
becomes `editor-improvements:insertLineBelow` in a hotkey, and `vim.nmap("<CR>", "insertLineBelow")` in `init.js`.

No keys are bound by default. Bind the ones you want in `init.js` or in Settings → Hotkeys.

## How they behave in vim

- **Movement commands are motions.** `d` + the key deletes up to it, a count repeats it, and in visual mode it
  extends the selection. From the palette or a hotkey they do the same, one cursor at a time.
- **Editing commands finish like vim commands.** Run from visual mode they leave it, with a cursor at the start of
  what they changed. In normal mode the cursor never rests on a newline. In insert mode they leave you in insert
  mode.
- **Counts work.** `3` before a delete, copy, open-line or word-delete command does it three times as one change
  (`3J` joins three lines, as in vim). In visual mode the count is ignored, as vim ignores it there. Commands that
  work on a position, such as delete to end of line, run once.
- **Edits repeat with `.`.** Deleting, joining, copying, opening a line and changing case are all remembered as
  changes. Motions and selections are not.
- **One selection.** Obsidian's vim keeps a single selection, so the multiple-cursor commands use what vim has
  instead. See [Selections](#selections).
- **Lists continue.** *Insert line above/below* carries a bullet, number or task onto the new line and renumbers an
  ordered list, unless you turn that off in settings (**Continue lists on new lines**).
- **Registers are left alone.** Deleting a line or word does not touch vim's registers.

## Commands

### Lines

| Id | Does |
|---|---|
| `insertLineAbove` | Opens a line above and moves to it |
| `insertLineBelow` | Opens a line below and moves to it; on an empty list item, ends the list |
| `deleteLine` | Deletes the line, or every line a selection touches |
| `deleteToStartOfLine` | Deletes back to the line start; at the start, deletes the newline before it |
| `deleteToEndOfLine` | Deletes to the line end; at the end, deletes the newline |
| `deleteWordBefore` / `deleteWordAfter` | Deletes a word, or the selection |
| `joinLines` | Joins the next line on, dropping its list marker and indentation |
| `duplicateLine` / `copyLineDown` | Copies the line (or selected lines) below and moves to the copy |
| `copyLineUp` | Copies the line above and stays on it |

### Cursor

All are motions.

| Id | Moves to |
|---|---|
| `goToLineStart` / `goToLineEnd` | The start or end of the line |
| `goToNextLine` / `goToPrevLine` | The next or previous line, keeping the column |
| `moveCursorUp` / `moveCursorDown` | The same, under the other names Editor Shortcuts gives them |
| `goToFirstLine` / `goToLastLine` | The start or end of the document |
| `goToNextChar` / `goToPrevChar` | One character along, across line breaks |
| `goToNextWord` / `goToPreviousWord` | The next or previous word boundary, the way Ctrl-arrow moves |
| `goToNextHeading` / `goToPrevHeading` | The end of the next or previous heading line, from Obsidian's metadata cache |
| `goToLineNumber` | Asks for a line number (an action, not a motion) |

### Selections

| Id | Does |
|---|---|
| `selectLine` | `V`; run again, selects one more line |
| `selectToNextWord` / `selectToPreviousWord` | Extends the selection by a word |
| `selectWordOrNextOccurrence` | Selects the word; run again, selects its next occurrence |
| `selectAllOccurrences` | Searches for the word, so `n` walks the matches and `cgn` then `.` changes them |
| `expandSelectionToBrackets` | Selects inside the enclosing `()`, `[]` or `{}`; again, the brackets too; again, the pair around |
| `expandSelectionToQuotes` | The same for `'`, `"` and `` ` `` |
| `expandSelectionToQuotesOrBrackets` | The nearest of either |
| `insertCursorAbove` / `insertCursorBelow` | Starts a visual block, or grows it by a line |
| `addCursorsToSelectionEnds` | Visual block over the selected lines, then `A`: type once, it lands on every line |

#### Selections in macros and mappings

The selection commands (`selectWordOrNextOccurrence`, `selectToNextWord`, the `expandSelectionTo…` family and
`selectLine` in insert mode) take effect when the key that ran them has finished, because vim only notices a
selection made after that. Typed by hand that is instant. Inside a macro, a mapping or a dot repeat the next key runs
first and does not see the selection, so `gn` followed by `d` in a macro does not delete the word. Use vim's own
text objects there (`viw`, `vi(`).

#### Multiple cursors

Vim keeps one selection, so "add a cursor" cannot mean what it does elsewhere. The block commands give you vim's own
version: a visual block edits every line it covers with `I`, `A` or `c`, and the text you type is applied to all of
them when you leave insert mode.

### Text

| Id | Does |
|---|---|
| `transformToUppercase` / `transformToLowercase` / `transformToTitlecase` | Changes the case of the selection, or the word under the cursor |
| `toggleCase` | Cycles UPPER, lower, Title |

### Editor

| Id | Does |
|---|---|
| `undo` / `redo` | Undo or redo in the editor |
| `toggle-line-numbers` | Shows or hides line numbers |
| `indent-using-tabs` / `indent-using-spaces` | Sets the indentation style |

[upstream]: https://github.com/timhor/obsidian-editor-shortcuts
