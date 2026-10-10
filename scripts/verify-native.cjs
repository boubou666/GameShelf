// Run only against an isolated test instance started with GAMESHELF_DATA_DIR
// and WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find(
    (p) =>
      p.url().startsWith("http://tauri.localhost") ||
      p.url().startsWith("https://tauri.localhost"),
  );
  assert(page, "The isolated native GameShelf WebView was not found.");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Your library." }).waitFor();
  const count = await page.locator(".game-card").count();
  assert(count > 0, "The native app did not detect local installations.");
  assert.equal(
    await page.getByText("Browser preview · sample games").count(),
    0,
  );
  const first = await page
    .locator(".game-card")
    .first()
    .locator("h3")
    .textContent();
  await page.getByRole("textbox", { name: "Search games" }).fill(first);
  assert((await page.locator(".game-card").count()) > 0);
  await page.getByRole("textbox", { name: "Search games" }).fill("");
  const favorite = page.getByRole("button", {
    name: `Add ${first} to favorites`,
    exact: true,
  });
  await favorite.click();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /Favorites/ })
    .click();
  assert.equal(await page.locator(".game-card").count(), 1);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /Favorites/ })
    .click();
  await page
    .getByRole("button", {
      name: `Remove ${first} from favorites`,
      exact: true,
    })
    .click();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /All games/ })
    .click();
  await page
    .getByRole("button", { name: "Refresh library", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your shelf is up to date." })
    .waitFor();
  assert.equal(await page.locator(".game-card").count(), count);
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page
    .getByRole("button", { name: `View ${first}`, exact: true })
    .click();
  await page.getByRole("dialog", { name: "Game details" }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Connect a store", exact: true })
    .click();
  await page.getByRole("button", { name: "Connect GOG", exact: true }).click();
  await page.getByRole("dialog", { name: "Connect GOG" }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /All games/ })
    .click();
  await page.screenshot({ path: "test-results/gameshelf-native.png" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        native: true,
        localGames: count,
        accountsUsed: 0,
        checks: [
          "real installation scan",
          "search",
          "SQLite favorite persistence",
          "rescan",
          "game details",
          "GOG connection dialog",
          "no runtime errors",
        ],
      },
      null,
      2,
    ),
  );
  // Detach; do not close the app's browser process.
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
