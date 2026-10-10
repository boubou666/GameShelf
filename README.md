# GameShelf

A Windows desktop library for Steam, GOG, and Epic Games. Built with Tauri 2, React, TypeScript, Rust, SQLite, and Windows Credential Manager.

## Run

Build locally using the commands below. Tagged versions will be available from [GitHub Releases](https://github.com/boubou666/GameShelf/releases), with a portable executable and Windows installer. The initial version is still unreleased. WebView2 must be available (normally installed with Windows/Edge).

For development:

```powershell
npm ci
npm run desktop
```

Requires Node.js, Rust's MSVC toolchain, Visual Studio C++ Build Tools, and WebView2. The current implementation targets Windows; other platforms are not yet qualified.

## What works in this first version

- Automatically detects Steam libraries from the Windows registry and `libraryfolders.vdf`, including installations on other drives.
- Reads Epic installation manifests and GOG installation registry entries without accessing launcher credentials.
- Combines games into a searchable library with platform filters, installed view, favorites, grid/list layouts, and game details.
- Preserves favorites, launch history, library metadata, and account display names in a local SQLite database. Separate purchases retain their store identities.
- Opens Steam and Epic games through their official launchers. GOG games use their detected executable and installation working directory.
- Opens the relevant store for installation. Direct downloads, updates, repair, cloud saves, achievements, and friends are outside this version.
- Provides Steam OpenID sign-in plus Steam Web API library import, GOG browser-code sign-in, and Epic browser-code sign-in, with refreshable tokens stored in Windows Credential Manager.

## Connect an account

Open **Connections**. Each login opens the store's official website in your default browser. GameShelf never asks for your store password.

**Steam:** Sign in to verify and fill your SteamID64, then provide a personal Steam Web API key. The owned-library API respects Game details visibility; an inaccessible library produces an explanation instead of replacing the cache. Local Steam installations require neither a key nor sign-in. OpenID proves account identity but does not grant access to a private library.

**GOG:** Sign in, then paste the final `https://embed.gog.com/on_login_success?...&code=...` redirect URL into GameShelf. The one-time code is exchanged for a token. The connector reads your own GOG releases, follows page tokens, and requests product metadata.

**Epic:** Sign in, then paste the JSON response containing `authorizationCode` (or the code itself) into GameShelf. GameShelf exchanges it for a session and imports Windows game assets and their catalog metadata. DLC and Unreal Engine assets are excluded where provider metadata identifies them. Asset import is not a guarantee that every non-Windows purchase will appear.

GOG and Epic use community-documented launcher endpoints and public launcher client identifiers. They are not official partner integrations and may require changes when the providers change authentication or endpoints. No upstream downloader code or executables are bundled in this version. Account login and library sync require a final check with the user's accounts; they must not be described as authenticated end-to-end verified until that check is performed.

## Data and behavior

- Database: `%LOCALAPPDATA%\app.gameshelf.desktop\library.db` (Tauri resolves the app data directory).
- Secrets: Windows Credential Manager, service `GameShelf`, one entry per store. Tokens/API keys are not returned to the interface or stored in SQLite.
- `GAMESHELF_DATA_DIR` optionally overrides the database directory for isolated local qualification. It does not change credential-store entries; qualification must not sign in with user credentials.
- Failed sync retains the previous library. Successful sync reconciles ownership while retaining installations. Disconnect removes that store's saved credential and cached uninstalled games; installed games remain.
- Artwork is requested from store/CDN hosts. The app has no telemetry and requires no GameShelf server.
- Launch history records a launch request, not proof that a game successfully started or a live playtime tracker. Playtime displayed in this version is imported from Steam.
- Browser preview uses explicitly labeled sample games. It cannot authenticate, launch, or install games.

## Checks and packaging

```powershell
npm test
npx playwright test
cargo test --manifest-path src-tauri/Cargo.toml
npm run package
```

Playwright starts a local Vite server automatically. Its browser checks cover filtering, favorite persistence, layouts, modal keyboard behavior, responsive overflow, and preview isolation. Rust checks cover manifest parsing, code/redirect validation, ownership reconciliation, and persistence.

Windows packaging produces a portable binary at `src-tauri/target/release/gameshelf.exe` and an NSIS installer under `src-tauri/target/release/bundle/nsis/`. Builds are currently unsigned.

## Changelog and releases

See [CHANGELOG.md](CHANGELOG.md) for notable changes and [RELEASING.md](RELEASING.md) for the release process. Changes accumulate under `Unreleased`; release preparation synchronizes version files and creates a dated entry. GitHub release notes are extracted from that entry, and tagged releases run Windows validation before publishing binaries and checksums.

## Add this as a Codex project

Clone this repository, create a local project named **GameShelf** in Codex's Projects view, and attach the checkout as its primary folder. The checked-in `AGENTS.md` contains development and validation guidance.

## API references

- [Tauri architecture](https://tauri.app/concept/architecture/)
- [Steam authentication](https://partner.steamgames.com/doc/features/auth)
- [Steam owned-library API](https://partner.steamgames.com/doc/webapi/IPlayerService)
- [Heroic GOG connector](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/tree/main/src/backend/storeManagers/gog)
- [Legendary Epic API implementation](https://github.com/legendary-gl/legendary/blob/master/legendary/api/egs.py)

These references document interoperability facts. A later downloader integration should retain its upstream notices and receive a separate licensing review before distribution.
