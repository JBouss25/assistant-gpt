import { expect, test } from "@playwright/test";

// Pages publiques : rien ne doit dépasser en largeur sur mobile.
for (const path of ["/", "/enseignants", "/inscription", "/connexion", "/confidentialite"]) {
  test(`affichage mobile sans débordement : ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
