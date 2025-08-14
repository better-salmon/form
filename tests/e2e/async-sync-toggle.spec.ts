import { test, expect } from "@playwright/test";

test("async→sync clears waiting immediately without extra input", async ({
  page,
}) => {
  await page.goto("/?demo=async-sync-toggle-demo");

  const status = page.getByTestId("status");
  const input = page.getByTestId("field-input");
  const toSync = page.getByTestId("switch-to-sync");

  await input.fill("x");
  await expect(status).toHaveText("waiting");

  await toSync.click();

  // Should settle to sync state quickly (no debounce wait, no further typing)
  await expect(status).toHaveText("valid", { timeout: 1000 });
});

test("async→none clears waiting to idle without extra input", async ({
  page,
}) => {
  await page.goto("/?demo=async-sync-toggle-demo");

  const status = page.getByTestId("status");
  const input = page.getByTestId("field-input");
  const toNone = page.getByTestId("switch-to-none");

  await expect(status).toHaveText("valid");

  await input.fill("x");
  await expect(status).toHaveText("waiting");

  await toNone.click();
  await expect(status).toHaveText("idle", { timeout: 1000 });
});
