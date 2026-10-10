# Changelog

All notable changes to GameShelf are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with versions following [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Windows desktop app built with Tauri, React, TypeScript, and Rust.
- Detection of installed Steam, GOG, and Epic games, including Steam libraries on multiple drives.
- Combined library with search, platform filters, installed view, favorites, grid/list layouts, and game details.
- Local SQLite cache for libraries, favorites, account display names, and launch history.
- Steam OpenID sign-in and Web API library import, plus GOG and Epic browser-code account connections.
- Account-token storage in Windows Credential Manager.
- Game launching through Steam and Epic launchers and detected GOG executables.
- Store handoff for game installation.
- Explicitly labeled browser preview with sample games.
- Automated library, backend, and browser checks and Windows executable/installer packaging.
- Windows CI and tag-based release publishing with notes extracted from this changelog.
- Release preparation commands that keep application versions and changelog entries consistent.

[Unreleased]: https://github.com/boubou666/GameShelf/commits/main
