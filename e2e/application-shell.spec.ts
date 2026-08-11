import { expect, test } from "@playwright/test";

test("redirects unauthenticated users to the Swedish login page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(
    page.getByRole("heading", { level: 1, name: "Logga in" }),
  ).toBeVisible();
  await expect(
    page.getByText("Testmiljö – använd endast fiktiva uppgifter."),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
});

test("makes the skip link available from the keyboard", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Hoppa till huvudinnehåll" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute("href", "#huvudinnehall");
});

test("reports application and database health", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
