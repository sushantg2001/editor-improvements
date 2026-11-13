# Contributing

Thanks for helping with editor-improvements. The full process is in [docs/sdlc.md](docs/sdlc.md). This page is the short version.

## Making a change

1. Branch off `main` as `<type>/<slug>`, for example `feat/search-filters` or `fix/null-date`. The types are `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style` and `revert`.
2. Add tests with the change. A bug fix starts with a failing test.
3. Run the repo's gates locally; they are the same ones CI runs.
4. Open a pull request titled `type(scope): summary`, for example `feat(search): add filters`. CI checks the title and the branch name. The title becomes the commit on `main`, and it decides the next version: `feat` is a minor release, `fix`, `perf` and `revert` a patch, and `!` or a `BREAKING CHANGE:` footer a major one. `docs`, `test`, `refactor`, `style`, `build`, `ci` and `chore` release nothing.
5. A maintainer squash-merges it. One commit lands on `main` with your title.

Urgent fixes follow the same path as any `fix/<slug>` branch. There is no separate hotfix branch.

## Adding a feature

A feature is a module: one file in `src/modules/` that exports a `FeatureModule`, plus one line in `src/modules/index.ts`. `main.ts` does not change.

```ts
export const myModule: FeatureModule = {
	id: "my-module", // kebab-case, becomes the registry source `module:my-module`
	title: "What it does in one line",
	create: (ctx) => ({ contribution: { actions: [/* ... */] } }),
};
```

- Action ids are camelCase and unique across all modules, except where a command keeps the id of the plugin it replaces. Groups are capitalised labels.
- `create` must not touch the editor or the Vim API; actions do that when they run.
- Tests mirror `src/`: `tests/unit/modules/<id>.test.ts` for logic (a `<id>/` folder when the module has several files, as `editor-shortcuts` does), `tests/integration/modules/<id>*.test.ts` for behaviour against the real CodeMirror vim. `tests/unit/modules/contract.test.ts` checks every listed module automatically.
- Shared test helpers live in `tests/helpers/`.

## Collaboration

Right now collaboration means opening pull requests: fork the repo, or push a `<type>/<slug>` branch if you were invited, then open a PR. You do not need to sign commits. Only the maintainer merges and tags. `claude/*` branches are local-only and GitHub rejects them.

## Releases

Nobody but the maintainer releases. release-please keeps a `chore(main): release x.y.z` pull request up to date, and a draft release appears when the maintainer merges it, but it creates no tag. The maintainer signs the tag (`git tag -s x.y.z`) and pushes it; the release workflow then checks the tag, waits for the maintainer's approval and publishes. See [docs/sdlc.md](docs/sdlc.md).

## License

By contributing you agree that your contribution is licensed under the project's license (see `LICENSE`).

## Reporting bugs

Use the bug template and include the version and your platform.
