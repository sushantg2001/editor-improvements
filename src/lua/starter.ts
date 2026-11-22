/** The config a new user starts from. */
export const STARTER_CONFIG = String.raw`-- Editor Improvements config. Saving this file reloads it.
-- While the plugin runs, this file replaces Obsidian's hotkeys.

vim.g.mapleader = " "
vim.o.timeoutlen = 500

-- Editing
obsidian.keymap.set({ "editor:i", "editor:v", "input", "global" }, "<C-c>", "native:copy")
obsidian.keymap.set({ "editor:i", "editor:v", "input" }, "<C-x>", "native:cut")
obsidian.keymap.set({ "editor:i", "editor:n", "input" }, "<C-v>", "native:paste")
obsidian.keymap.set("editor:i", "<C-z>", "native:undo")
obsidian.keymap.set("editor:i", "<C-S-z>", "native:redo")
obsidian.keymap.set({ "editor:i", "editor:n", "input" }, "<C-a>", "native:select-all")

-- Finding things
obsidian.keymap.set("global", "<C-p>", "obsidian:command-palette:open")
obsidian.keymap.set("global", "<C-o>", "obsidian:switcher:open")
obsidian.keymap.set("global", "<C-S-f>", "obsidian:global-search:open")
obsidian.keymap.set("editor", "<C-f>", "obsidian:editor:open-search")

-- Notes, tabs and panes
obsidian.keymap.set("global", "<C-n>", "obsidian:file-explorer:new-file")
obsidian.keymap.set("global", "<C-s>", "obsidian:editor:save-file")
obsidian.keymap.set("global", "<C-t>", "obsidian:workspace:new-tab")
obsidian.keymap.set("global", "<C-w>", "obsidian:workspace:close")
obsidian.keymap.set("global", "<C-Tab>", "obsidian:workspace:next-tab")
obsidian.keymap.set("global", "<C-S-Tab>", "obsidian:workspace:previous-tab")
obsidian.keymap.set("global", "<C-,>", "obsidian:app:open-settings")

-- Leader keys, in normal mode
vim.keymap.set("n", "<leader>f", obsidian.run("obsidian:switcher:open"), { desc = "Find a note" })
vim.keymap.set("n", "<leader>p", obsidian.run("obsidian:command-palette:open"), { desc = "Command palette" })
vim.keymap.set("n", "<leader>v", obsidian.run("obsidian:workspace:split-vertical"), { desc = "Split right" })

-- Vim behaviour
vim.keymap.set("n", "j", "gj")
vim.keymap.set("n", "k", "gk")
vim.keymap.set("i", "jk", "<Esc>")
`;
