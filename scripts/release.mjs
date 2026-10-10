import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repository = "https://github.com/boubou666/GameShelf";
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function normalizeVersion(value) {
  const version = value?.replace(/^v/, "");
  if (!version || !versionPattern.test(version))
    throw new Error("Use a stable version such as 0.1.0 or v0.1.0.");
  return version;
}
function headings(text) {
  return [
    ...text.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm),
  ];
}
export function section(text, name) {
  const entries = headings(text);
  const matches = entries.filter((h) => h[1] === name);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one [${name}] changelog section.`);
  const match = matches[0];
  const index = entries.indexOf(match);
  const start = match.index + match[0].length;
  const footer = text.slice(start).search(/^\[[^\]]+\]: /m);
  const end = Math.min(
    entries[index + 1]?.index ?? text.length,
    footer < 0 ? text.length : start + footer,
  );
  return {
    start: match.index,
    end,
    date: match[2],
    body: text.slice(start, end).trim(),
  };
}
export function releaseNotes(text, input) {
  const version = normalizeVersion(input);
  const release = section(text, version);
  if (!release.date || !release.body || !/^- /m.test(release.body))
    throw new Error(
      `Release ${version} needs a date and curated changelog notes.`,
    );
  return `${release.body}\n`;
}
export function prepareChangelog(text, input, date) {
  const version = normalizeVersion(input);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("Use a real release date in YYYY-MM-DD format.");
  if (headings(text).some((h) => h[1] === version))
    throw new Error(`Release ${version} already exists.`);
  const draft = section(text, "Unreleased");
  if (!draft.body || !/^- /m.test(draft.body))
    throw new Error(
      "Add notable changes under [Unreleased] before preparing a release.",
    );
  const previous = headings(text).find((h) => h[1] !== "Unreleased")?.[1];
  let next = `${text.slice(0, draft.start)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${draft.body}\n\n${text.slice(draft.end)}`;
  next = next.replace(/^\[Unreleased\]: .*\r?\n?/gm, "").trimEnd();
  const link = previous
    ? `${repository}/compare/v${previous}...v${version}`
    : `${repository}/releases/tag/v${version}`;
  return `${next}\n\n[Unreleased]: ${repository}/compare/v${version}...HEAD\n[${version}]: ${link}\n`;
}
function versionInToml(text, packageName) {
  const expression = packageName
    ? new RegExp(`(^name = "${packageName}"\\r?\\nversion = ")([^"]+)(")`, "m")
    : /(^version = ")([^"]+)(")/m;
  const match = text.match(expression);
  if (!match)
    throw new Error(
      "Could not locate the application version in Cargo metadata.",
    );
  return { value: match[2], expression };
}
export function checkVersions(root, expected) {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(
    readFileSync(resolve(root, "package-lock.json"), "utf8"),
  );
  const tauri = JSON.parse(
    readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
  const cargoLock = readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8");
  const version = normalizeVersion(expected ?? pkg.version);
  const values = [
    pkg.version,
    lock.version,
    lock.packages[""].version,
    tauri.version,
    versionInToml(cargo).value,
    versionInToml(cargoLock, "gameshelf").value,
  ];
  if (values.some((v) => v !== version))
    throw new Error(
      "Package, lockfiles, Cargo, Tauri, and release tag versions must match.",
    );
  return { version, pkg, lock, tauri, cargo, cargoLock };
}
export function prepareRelease(root, input, date) {
  const current = checkVersions(root);
  const version = normalizeVersion(input);
  const compare =
    version
      .split(".")
      .map(Number)
      .map((n, i) => n - Number(current.version.split(".")[i]))
      .find((n) => n !== 0) ?? 0;
  if (compare < 0)
    throw new Error(
      "A release version cannot be lower than the current application version.",
    );
  const changelog = prepareChangelog(
    readFileSync(resolve(root, "CHANGELOG.md"), "utf8"),
    version,
    date,
  );
  current.pkg.version = version;
  current.lock.version = version;
  current.lock.packages[""].version = version;
  current.tauri.version = version;
  const files = {
    "package.json": `${JSON.stringify(current.pkg, null, 2)}\n`,
    "package-lock.json": `${JSON.stringify(current.lock, null, 2)}\n`,
    "src-tauri/tauri.conf.json": `${JSON.stringify(current.tauri, null, 2)}\n`,
    "src-tauri/Cargo.toml": current.cargo.replace(
      versionInToml(current.cargo).expression,
      `$1${version}$3`,
    ),
    "src-tauri/Cargo.lock": current.cargoLock.replace(
      versionInToml(current.cargoLock, "gameshelf").expression,
      `$1${version}$3`,
    ),
    "CHANGELOG.md": changelog,
  };
  for (const [path, content] of Object.entries(files))
    writeFileSync(resolve(root, path), content);
}
function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const [command, input, flag, date] = process.argv.slice(2);
  try {
    if (command === "prepare") {
      if (flag && flag !== "--date")
        throw new Error("Optional date syntax is --date YYYY-MM-DD.");
      prepareRelease(root, input, date ?? today());
      console.log(
        `Prepared ${normalizeVersion(input)}. Review, test, and merge these changes before tagging.`,
      );
    } else if (command === "check") {
      const { version } = checkVersions(root, input);
      const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
      section(changelog, "Unreleased");
      if (input) releaseNotes(changelog, version);
      console.log(
        `Versions consistent: ${version}${input ? "; release notes present" : ""}.`,
      );
    } else if (command === "notes") {
      const { version } = checkVersions(root, input);
      process.stdout.write(
        releaseNotes(
          readFileSync(resolve(root, "CHANGELOG.md"), "utf8"),
          version,
        ),
      );
    } else
      throw new Error(
        "Usage: node scripts/release.mjs prepare VERSION [--date YYYY-MM-DD] | check [VERSION] | notes VERSION",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
