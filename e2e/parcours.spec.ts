import { expect, test, type Page } from "@playwright/test";

// Compte enseignant créé par supabase/seed.sql
const TEACHER = { email: "claire.dubois@demo.mentora.fr", password: "mentora-demo" };
const TEACHER_PAGE = "/enseignants/00000000-0000-4000-8000-000000000001";

// Valeurs uniques pour pouvoir relancer le test sans réinitialiser la base.
const run = Date.now().toString(36);
const studentName = `Léa Test ${run}`;
const studentEmail = `eleve.${run}@test.mentora.fr`;

/** Un mercredi dans 2 à 40 semaines, pour éviter les créneaux déjà pris. */
function futureWednesday() {
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7) + 7 * (2 + Math.floor(Math.random() * 38)));
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("main button[type=submit]");
  await page.waitForURL("**/tableau-de-bord");
}

test("élève et enseignant : matching, demande, messagerie, réservation", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  const teacher = await (await browser.newContext()).newPage();

  await test.step("l'élève s'inscrit et complète son profil", async () => {
    await student.goto("/inscription");
    await student.fill("#full_name", studentName);
    await student.fill("#email", studentEmail);
    await student.fill("#password", "motdepasse123");
    await student.click("main button[type=submit]");
    await student.waitForURL("**/onboarding");

    await student.fill("#city", "Lyon");
    await student.check("input[name=level][value=lycee]", { force: true });
    await student.selectOption("#grade", "Terminale");
    for (const s of ["Mathématiques", "Physique-Chimie"]) {
      await student.check(`input[name=subjects][value="${s}"]`, { force: true });
    }
    await student.fill("#budget_max", "50");
    // Créneaux qui correspondent tous à ceux de Claire Dubois.
    for (const slot of ["mon_evening", "wed_afternoon", "sat_morning"]) {
      await student.check(`input[name=availability][value=${slot}]`, { force: true });
    }
    await student.click("main button[type=submit]");
    await student.waitForURL("**/tableau-de-bord");
  });

  await test.step("le matching propose Claire Dubois en premier", async () => {
    await expect(student.locator('main a[href^="/enseignants/"]').first()).toContainText("Claire Dubois");
  });

  await test.step("l'élève envoie une demande", async () => {
    await student.goto(TEACHER_PAGE);
    await student.fill("#message", "Bonjour, je suis en Terminale et je voudrais progresser en mécanique.");
    await student.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(student.getByText("Demande envoyée")).toBeVisible();
  });

  let conversationUrl = "";
  await test.step("l'enseignante accepte la demande", async () => {
    await signIn(teacher, TEACHER.email, TEACHER.password);
    const row = teacher.locator("li", { hasText: studentName });
    await row.getByRole("button", { name: "Accepter" }).click();
    await row.getByRole("link", { name: "Écrire" }).click();
    await teacher.waitForURL("**/messages/*");
    conversationUrl = new URL(teacher.url()).pathname;
  });

  await test.step("les messages arrivent en temps réel", async () => {
    await student.goto(conversationUrl);
    await student.waitForTimeout(1500); // laisse le temps à l'abonnement temps réel
    const hello = `Bonjour ! (${run})`;
    await teacher.getByLabel("Votre message").fill(hello);
    await teacher.keyboard.press("Enter");
    // Reçu par l'élève sans recharger la page.
    await expect(student.locator("p", { hasText: hello })).toBeVisible();

    const reply = `Merci, à mercredi ! (${run})`;
    await student.getByLabel("Votre message").fill(reply);
    await student.getByRole("button", { name: "Envoyer" }).click();
    await expect(teacher.locator("p", { hasText: reply })).toBeVisible();
  });

  const date = futureWednesday();
  await test.step("l'élève propose un cours de 1 h 30", async () => {
    await student.fill("#date", date);
    await student.selectOption("#time", "14:30");
    await student.check('input[name=duration][value="90"]', { force: true });
    await student.getByRole("button", { name: "Proposer ce créneau" }).click();
    await expect(student.getByText("Cours proposé")).toBeVisible();
  });

  await test.step("un créneau qui chevauche est refusé", async () => {
    await student.goto(conversationUrl);
    await student.fill("#date", date);
    await student.selectOption("#time", "15:00");
    await student.check('input[name=duration][value="120"]', { force: true });
    await student.getByRole("button", { name: "Proposer ce créneau" }).click();
    await expect(student.locator("form [role=alert]")).toContainText("chevauche");
  });

  await test.step("l'enseignante confirme dans le calendrier", async () => {
    await teacher.goto(`/calendrier?semaine=${date}`);
    const item = teacher.locator("aside li", { hasText: studentName });
    await item.getByRole("button", { name: "Confirmer" }).click();
    await teacher.goto(`/calendrier?semaine=${date}`);
    await expect(teacher.locator("div[title]", { hasText: studentName })).toContainText("14:30 – 16:00");
  });

  await test.step("l'enseignante signale puis bloque l'élève", async () => {
    await teacher.goto(conversationUrl);
    await teacher.getByRole("button", { name: "Signaler" }).click();
    await teacher.fill("textarea[name=reason]", "Test de signalement automatique.");
    await teacher.getByRole("button", { name: "Envoyer le signalement" }).click();
    await expect(teacher.getByText("notre équipe va examiner")).toBeVisible();

    await teacher.getByRole("button", { name: "Bloquer" }).first().click();
    await teacher.locator("form", { hasText: "ne pourra plus vous écrire" }).getByRole("button", { name: "Bloquer" }).click();
    await expect(teacher.getByText("Vous avez bloqué")).toBeVisible();

    await student.goto(conversationUrl);
    await expect(student.getByText("Cette conversation est fermée.")).toBeVisible();
    await expect(student.getByLabel("Votre message")).toHaveCount(0);
  });

  await test.step("après déblocage, la conversation reprend", async () => {
    await teacher.getByRole("button", { name: /Débloquer/ }).click();
    await expect(teacher.getByLabel("Votre message")).toBeVisible();
  });
});
