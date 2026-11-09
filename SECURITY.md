# Security

## Scripts run with full access to your vault

Vim Tools can load JavaScript from `<vault>/.obsidian/vim-tools/`. That code runs inside Obsidian with the same
access as any plugin: it can read and write your notes, the clipboard and the network. The setting is **off** by
default.

A synced vault copies the folder to every device and runs it there, so only enable scripts if you trust everything
that can write to that folder.

## Reporting a vulnerability

Please do not open a public issue. Use [private vulnerability reporting][report] on this repository, or contact the
maintainer through the address on their GitHub profile.

[report]: https://github.com/sushantg2001/editor-improvements/security/advisories/new
