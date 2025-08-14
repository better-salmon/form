import { test, expect } from "@playwright/test";

test("home loads and shows default demo", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Vite/);
  await expect(
    page.getByRole("heading", { name: "Form Demo", exact: true }),
  ).toBeVisible();
});
