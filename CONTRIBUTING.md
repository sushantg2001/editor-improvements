# Contributing

## Setup

```bash
git clone https://github.com/sushantg2001/editor-improvements.git
cd editor-improvements
bun install --frozen-lockfile
bun run gates
```

`bun run gates` runs the same checks as CI. `bun run dev` rebuilds `main.js` on every change.

## Making a change

1. Branch from `main` as `<type>/<slug>`. The types are `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style` and `revert`.
2. Add tests. A bug fix starts with a failing test.
3. Open a PR titled `type(scope): summary`. The title becomes the squash commit and sets the next version: `feat` is minor, `fix` is patch, `!` is major, and other types release nothing.

Pin every dependency to an exact version.

The maintainer runs the end-to-end tests and makes each release.

## License

Contributions are licensed under the project's [MIT license](LICENSE).
