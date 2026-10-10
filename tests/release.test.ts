import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeVersion,
  prepareChangelog,
  releaseNotes,
  prepareRelease,
  checkVersions,
} from "../scripts/release.mjs";

const draft =
  "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First library.\n\n[Unreleased]: https://example.com\n";
test("preparation keeps Unreleased and moves curated notes into a dated release", () => {
  const next = prepareChangelog(draft, "0.1.0", "2026-10-10");
  assert.equal(releaseNotes(next, "v0.1.0"), "### Added\n\n- First library.\n");
  assert.match(next, /## \[Unreleased\]\n\n## \[0\.1\.0\] - 2026-10-10/);
  assert.match(next, /compare\/v0\.1\.0\.\.\.HEAD/);
});
test("empty, duplicate, undated, and invalid releases are rejected", () => {
  assert.throws(() =>
    prepareChangelog("## [Unreleased]\n", "0.1.0", "2026-10-10"),
  );
  assert.throws(() => prepareChangelog(draft, "0.1.0", "2026-02-30"));
  assert.throws(() => normalizeVersion("0.01.0"));
  assert.throws(() => normalizeVersion("v0.1.0;echo"));
  assert.throws(() => releaseNotes(draft, "0.1.0"));
  assert.throws(() =>
    prepareChangelog(
      prepareChangelog(draft, "0.1.0", "2026-10-10"),
      "0.1.0",
      "2026-10-10",
    ),
  );
});
test("subsequent release links compare the previous tag", () => {
  const first = prepareChangelog(draft, "0.1.0", "2026-10-10");
  const next = first.replace(
    "## [Unreleased]\n",
    "## [Unreleased]\n\n### Fixed\n\n- Sync retry.\n",
  );
  assert.match(
    prepareChangelog(next, "0.1.1", "2026-10-11"),
    /\[0\.1\.1\]: .*compare\/v0\.1\.0\.\.\.v0\.1\.1/,
  );
});
test("release preparation synchronizes all manifests and leaves dependency versions intact", () => {
  const root = mkdtempSync(join(tmpdir(), "gameshelf-release-"));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      version: "0.1.0",
      packages: {
        "": { version: "0.1.0" },
        "node_modules/test": { version: "9.0.0" },
      },
    }),
  );
  writeFileSync(
    join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.toml"),
    '[package]\nname = "gameshelf"\nversion = "0.1.0"\n',
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.lock"),
    '[[package]]\nname = "dependency"\nversion = "9.0.0"\n\n[[package]]\nname = "gameshelf"\nversion = "0.1.0"\n',
  );
  writeFileSync(join(root, "CHANGELOG.md"), draft);
  prepareRelease(root, "0.2.0", "2026-10-10");
  assert.equal(checkVersions(root, "v0.2.0").version, "0.2.0");
  assert.match(
    readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8"),
    /name = "dependency"\nversion = "9.0.0"/,
  );
  assert.equal(
    JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages[
      "node_modules/test"
    ].version,
    "9.0.0",
  );
  assert.throws(() => checkVersions(root, "0.3.0"));
});
