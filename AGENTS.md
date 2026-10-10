# GameShelf development

GameShelf is a Windows-first desktop application: Tauri 2, React/TypeScript/Vite, Rust, SQLite, and Windows Credential Manager.

## Commands

- `npm run desktop`: native development app.
- `npm run build`: frontend type check and production bundle.
- `npm test`: library behavior tests.
- `npx playwright test`: UI scenarios; starts its own Vite server.
- `cargo test --manifest-path src-tauri/Cargo.toml`: backend scenarios.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`: format backend code.
- `npm run package`: Windows executable and NSIS installer.
- `npm run release:check`: verify synchronized versions and changelog structure.
- `npm run release:prepare -- X.Y.Z`: prepare a dated release and synchronize all version files.

## Structure

- `src/App.tsx` and `src/style.css`: desktop UI.
- `src/bridge.ts`: native commands and clearly labeled browser preview.
- `src/library.ts`: pure filter and ordering behavior.
- `src-tauri/src/db.rs`: persistence and store reconciliation.
- `src-tauri/src/scan.rs`: read-only local installation discovery.
- `src-tauri/src/stores.rs`: account connection and owned-library retrieval.
- `src-tauri/src/steam_auth.rs`: Steam OpenID browser callback and verification.

## Constraints

- Keep provider tokens and API keys in OS credential storage. Never log them or return them to the UI. Sanitize network errors so URLs, authentication codes, and token responses cannot appear in diagnostics.
- Do not read or reuse credentials from installed launchers. The user connects accounts explicitly in GameShelf.
- Preserve cached libraries on network or metadata failures; reconcile only complete successful imports.
- Keep purchases identified by `(store, store ID)` and retain separate copies.
- Local scans are read-only. Never modify store manifests, registry entries, or game files.
- Launch only records selected from the database. GOG executable paths must resolve inside the detected installation directory. Never execute arbitrary commands from UI input.
- Preview data must stay visibly labeled and must never appear as the user's library in the desktop app.
- Keep the quiet charcoal/sage visual design, accessible keyboard dialogs, and artwork fallbacks. Avoid placeholders presented as finished functionality.
- Verify native behavior as well as browser behavior. Passing preview tests does not establish working store authentication or game launches.
- Use `GAMESHELF_DATA_DIR` for isolated native qualification. Never store personal tokens in test fixtures.
- Work on branches and pull requests; no direct pushes to `main`. The public repository is `boubou666/GameShelf`.
- Add notable changes to `CHANGELOG.md` under `Unreleased`, using Keep a Changelog categories. Follow `RELEASING.md` for version preparation, validation, tags, and changelog-based GitHub release notes. Do not tag or publish releases unless the user requests that step.

## Next milestones

Qualify real account login/import with user participation, improve per-game installation targeting and GOG launch arguments, then introduce Legendary/gogdl behind replaceable adapters for direct download management. Add code signing and multi-platform qualification separately.
