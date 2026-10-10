# Releasing GameShelf

`CHANGELOG.md` is the release history and the source of GitHub release notes. It follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning.

## During development

Write concise, user-facing entries under `## [Unreleased]`, grouped by the relevant categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Omit empty categories and describe notable behavior changes rather than dumping Git commits. Keep known limitations and validation evidence in the README and validation documentation.

The initial application is version `0.1.0`; its first public release remains **Unreleased** until explicitly prepared and tagged. Creating or pushing the repository does not publish a release.

## Prepare a release

Create a release branch from the current `main`. For the first release:

```powershell
npm run release:prepare -- 0.1.0
```

For subsequent releases, choose the next semantic version. An explicit date can be supplied with `--date YYYY-MM-DD`. The default date uses Europe/Paris.

The preparation command moves the current Unreleased notes into a dated release, keeps a fresh Unreleased section, updates comparison links, and synchronizes:

- `package.json` and the application's entry in `package-lock.json`.
- `src-tauri/Cargo.toml` and the application's entry in `src-tauri/Cargo.lock`.
- `src-tauri/tauri.conf.json`.

The command validates all inputs before writing. Review the diff; edit the curated notes if needed. Run the checks:

```powershell
npm run release:check -- v0.1.0
npm test
npx playwright test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run package
```

Push the branch and open a pull request. Wait for the Windows CI check to pass, review, and merge manually. Do not publish a tag until a release has been requested and the release-preparation PR has been merged.

## Tag and publish

From the merged, up-to-date `main`:

```powershell
git pull --ff-only
npm run release:check -- v0.1.0
git tag -a v0.1.0 -m "GameShelf 0.1.0"
git push origin v0.1.0
```

The `Release` workflow checks that the tag matches every version file, that a dated nonempty changelog section exists, and that the commit is on `main`. It then runs the Windows CI checks and packaging before publishing the GitHub release.

Release notes come from that version's changelog section, not generated commit summaries. Each release contains the portable `GameShelf.exe`, the Windows NSIS installer, and `SHA256SUMS.txt`. Builds are unsigned until code signing is configured.

Wait for the workflow to finish, inspect the published release and attached assets, download and verify checksums, then qualify the portable/installed app. A successful build does not prove store login or game compatibility.

If publication fails, inspect the run and any partial/draft release before retrying. Do not create a second tag or silently move an existing published tag.
