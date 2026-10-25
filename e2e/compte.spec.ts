import { expect, test } from "@playwright/test";

test("un utilisateur peut supprimer son compte depuis l'appli", async ({ page }) => {
  const run = Date.now().toString(36);
  const email = `supprime.${run}@test.mentora.fr`;

  await page.goto("/inscription?role=teacher");
  await page.fill("#full_name", `Compte Test ${run}`);
  await page.fill("#email", email);
  await page.fill("#password", "motdepasse123");
  await page.click("main button[type=submit]");
  await page.waitForURL("**/onboarding");

  await page.goto("/profil");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.fill("#confirm", "oui");
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("SUPPRIMER"); // mot de confirmation exigé

  await page.fill("#confirm", "SUPPRIMER");
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Le compte n'existe plus : la connexion échoue.
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", "motdepasse123");
  await page.click("main button[type=submit]");
  await expect(page.locator("form [role=alert]")).toContainText("incorrect");
});

test("les pages exigées par les stores sont accessibles", async ({ page }) => {
  for (const [path, title] of [
    ["/confidentialite", "Politique de confidentialité"],
    ["/conditions", "Conditions d'utilisation"],
    ["/support", "Aide et contact"],
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveText(title);
  }
  await page.goto("/");
  await expect(page.locator("footer").getByRole("link", { name: "Confidentialité" })).toBeVisible();
});
