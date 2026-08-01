import { expect, test } from "@playwright/test";

test("shows the minimal Swedish application shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(
    page.getByRole("heading", { level: 1, name: "Projektgrund" }),
  ).toBeVisible();
  await expect(
    page.getByText("Testmiljö – använd endast fiktiva uppgifter."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Hem" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("makes the skip link available from the keyboard", async ({ page }) => {
  await page.goto("/");
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
