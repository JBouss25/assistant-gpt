import { expect, test } from "@playwright/test";
import { DEMO, createFinishedLesson } from "./fixtures";

// Données de démo (supabase/seed.sql) : Léa (élève), Sophie (sa mère), Claire (enseignante).
const PASSWORD = "mentora-demo";

test("un parent relie son enfant et suit sa progression ; l'enseignante rédige un compte-rendu", async ({ browser }) => {
  const run = Date.now().toString(36);
  const parent = await (await browser.newContext()).newPage();
  const teacher = await (await browser.newContext()).newPage();

  await test.step("inscription d'un parent avec le code de l'enfant", async () => {
    await parent.goto("/inscription?role=parent");
    await expect(parent.locator("input[name=role][value=parent]")).toBeChecked();
    await parent.fill("#full_name", `Parent Test ${run}`);
    await parent.fill("#email", `parent.${run}@test.mentora.fr`);
    await parent.fill("#password", "motdepasse123");
    await parent.click("main button[type=submit]");
    await parent.waitForURL("**/onboarding");
    await parent.fill("#code", "MAUVAIS1");
    await parent.click("main button[type=submit]");
    await expect(parent.locator("form [role=alert]")).toContainText("Code inconnu");
    await parent.fill("#code", DEMO.leaCode.toLowerCase());
    await parent.click("main button[type=submit]");
    await parent.waitForURL("**/tableau-de-bord");
  });

  await test.step("le tableau de bord parent affiche Léa et sa courbe de notes", async () => {
    await expect(parent.getByText("Léa Bernard").first()).toBeVisible();
    await expect(parent.locator("main svg[role=img]").first()).toBeVisible();
    // Un parent n'a ni messagerie ni calendrier.
    await expect(parent.getByRole("link", { name: "Messages" })).toHaveCount(0);
  });

  const { id: lessonId } = await createFinishedLesson();

  await test.step("l'enseignante rédige le compte-rendu du cours terminé", async () => {
    await teacher.goto("/connexion");
    await teacher.fill("#email", "claire.dubois@demo.mentora.fr");
    await teacher.fill("#password", PASSWORD);
    await teacher.click("main button[type=submit]");
    await teacher.waitForURL("**/tableau-de-bord");
    const item = teacher.locator("details", { has: teacher.locator(`input[name=lesson_id][value="${lessonId}"]`) });
    await item.locator("summary").click();
    await item.locator("input[name=grade]").fill("17.5");
    await item.locator("input[name=topics]").fill(`Ondes mécaniques ${run}`);
    await item.locator("input[name=homework]").fill("Exercices 3 et 4");
    await item.getByRole("button", { name: "Enregistrer le compte-rendu" }).click();
    await expect(teacher.getByText("Compte-rendu enregistré")).toBeVisible();
  });

  await test.step("le parent voit le nouveau compte-rendu sur la page de progression", async () => {
    await parent.goto(`/suivi/${DEMO.lea}`);
    await expect(parent.getByRole("heading", { name: "Évolution des notes" })).toBeVisible();
    await expect(parent.getByText(`Ondes mécaniques ${run}`)).toBeVisible();
    await expect(parent.getByText("17,5/20").first()).toBeVisible();
  });

  await test.step("un parent ne voit pas les élèves qui ne sont pas ses enfants", async () => {
    await parent.goto(`/suivi/${DEMO.claire}`);
    await expect(parent.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  });
});

test("l'élève voit son code parent et sa progression", async ({ page }) => {
  await page.goto("/connexion");
  await page.fill("#email", "lea.bernard@demo.mentora.fr");
  await page.fill("#password", PASSWORD);
  await page.click("main button[type=submit]");
  await page.waitForURL("**/tableau-de-bord");

  await page.goto("/profil");
  await expect(page.getByText(DEMO.leaCode)).toBeVisible();
  await expect(page.getByText("Sophie Bernard")).toBeVisible();

  await page.getByRole("link", { name: "Progression" }).click();
  await expect(page.getByRole("heading", { name: "Ma progression" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Heures de cours par mois" })).toBeVisible();
});
