import { test, expect } from "@playwright/test";

test("useField props revalidate fields when props change", async ({ page }) => {
  await page.goto("/?demo=form-demo");

  const nameInput = page.getByPlaceholder("Enter your name...");
  const emailInput = page.getByPlaceholder("Enter your email...");
  const minLengthInput = page.locator("#minLength");
  const submit = page.getByRole("button", { name: "Create Account" });

  await expect(submit).toBeDisabled();

  await nameInput.fill("abcd");
  await emailInput.fill("abcd@example.com");
  await expect(submit).toBeEnabled();

  await minLengthInput.fill("10");
  await expect(submit).toBeDisabled();

  await minLengthInput.fill("3");
  await expect(submit).toBeEnabled();
});
