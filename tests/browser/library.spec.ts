import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Hades", exact: true }),
  ).toBeVisible();
});
test("search and platform filters work together", async ({ page }) => {
  await page.getByRole("textbox", { name: "Search games" }).fill("hades");
  await expect(page.locator(".game-card")).toHaveCount(1);
  await page.getByRole("button", { name: "View Hades", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Game details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Platform navigation" })
    .getByRole("button", { name: "GOG" })
    .click();
  await expect(page.locator(".game-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "View Cyberpunk 2077", exact: true }),
  ).toBeVisible();
});
test("favorites persist across reloads and can be removed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add Hades to favorites" }).click();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /Favorites/ })
    .click();
  await expect(page.locator(".game-card")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /Favorites/ })
    .click();
  await expect(
    page.getByRole("button", { name: "View Hades", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Hades from favorites" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Keep your next favorites close" }),
  ).toBeVisible();
});
test("installed view and layout preference persist", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: /Installed/ })
    .click();
  await expect(page.locator(".game-card")).toHaveCount(6);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".games.list")).toBeVisible();
  await page.reload();
  await expect(page.locator(".games.list")).toBeVisible();
});
test("connection dialog explains real login and traps focus", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Connect a store", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Epic Games", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Connect Epic Games" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "One-time login response" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Sign in with Epic Games" }).click();
  await expect(dialog.getByRole("alert")).toContainText("browser preview");
  await dialog
    .getByRole("button", { name: "Connect library", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
test("search keyboard shortcut and empty results", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("textbox", { name: "Search games" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search games" })
    .fill("zz-no-such-game");
  await expect(
    page.getByRole("heading", { name: "No games found" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear search", exact: true })
    .last()
    .click();
  await expect(page.locator(".game-card")).toHaveCount(8);
});
test("responsive library has no horizontal overflow", async ({ page }) => {
  for (const width of [1380, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("textbox", { name: "Search games" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test("preview is clearly labeled and cannot launch games", async ({ page }, testInfo) => {
  await expect(page.getByText("Browser preview · sample games")).toBeVisible();
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Open the GameShelf desktop app",
  );
  await page.screenshot({
    path: testInfo.outputPath("gameshelf-preview.png"),
    fullPage: true,
  });
});
