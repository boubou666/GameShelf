# GameShelf 0.1.0 qualification

Date: 10 October 2026. Host: Windows, MSVC Rust toolchain, Node.js 24.

## Passed

- Frontend strict TypeScript check and Vite production build.
- Three library behavior tests: intersecting filters, separate purchases, and non-mutating launch-history sorting.
- Eleven Rust tests: manifest parsing, incomplete-install exclusion, redirect/code validation, persistent favorites and launch timestamps, ownership reconciliation, and installed-state preservation.
- Rust Clippy on all targets with warnings treated as errors.
- Seven Chromium UI scenarios: search/platform selection, favorites across reload, installed view and layout persistence, connection-dialog focus and error behavior, keyboard search/empty state, responsive layout at 1380/900/390 pixels, and clearly labeled preview isolation.
- Native Tauri release application launched with an isolated database and a temporary local WebView debugging port. It discovered 100 local Steam games, across the configured Steam libraries. No user accounts or launcher credentials were read for qualification.
- Native WebView checks: real installation discovery, search, favorite write/read through SQLite and page reload, rescan with unchanged count, details dialog, GOG connection dialog, and no JavaScript runtime errors during the scenarios.
- Windows x64 release executable and NSIS installer successfully built. The portable executable was exercised; the installer was generated but not installed for qualification.

## Not yet verified

- Steam/GOG/Epic account login and owned-library imports with the user's accounts. Authentication must be performed by the user; passing parser tests or opening a dialog does not establish provider acceptance.
- Game launches, launcher installation prompts, GOG games requiring launch arguments, cloud saves, achievements, or direct download management.
- Native GOG/Epic manifest discovery on this machine: no GOG or Epic local installations were found. Their parser paths have fixture coverage only where listed above.
- Code signing, installed-app upgrade behavior, macOS, Linux, and tagged public release publication.

## Artifacts

Local qualification used a separate test database containing no account tokens. Databases, generated binaries, and screenshots are not committed. CI uploads Windows build artifacts; tagged releases publish executable/installer assets and checksums. The WebView debugging port is enabled only on the isolated qualification process, not in the shipped application's settings.
