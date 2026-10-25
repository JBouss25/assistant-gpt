import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Génère les captures d'écran des fiches App Store / Google Play depuis l'appli réelle.
 *   STORE_SCREENSHOTS=1 npx playwright test store-screenshots --project=desktop
 * Résultat : store/screenshots/{ios,android}/*.png
 */
test.skip(!process.env.STORE_SCREENSHOTS, "Lancer avec STORE_SCREENSHOTS=1");
test.setTimeout(240_000);

const DEVICES = {
  ios: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 }, // 1320 × 2868 (iPhone 6,9")
  android: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 }, // 1080 × 2400
};
const TEACHER = { email: "claire.dubois@demo.mentora.fr", password: "mentora-demo" };
const run = Date.now().toString(36);
const student = { name: "Léa Bernard", email: `lea.${run}@demo.mentora.fr`, password: "motdepasse123" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("main button[type=submit]");
  await page.waitForURL("**/tableau-de-bord");
}

async function seedScenario(browser: Browser) {
  const s = await (await browser.newContext()).newPage();
  await s.goto("/inscription");
  await s.fill("#full_name", student.name);
  await s.fill("#email", student.email);
  await s.fill("#password", student.password);
  await s.click("main button[type=submit]");
  await s.waitForURL("**/onboarding");
  await s.fill("#city", "Lyon");
  await s.selectOption("#grade", "Terminale");
  for (const v of ["Mathématiques", "Physique-Chimie"]) await s.check(`input[name=subjects][value="${v}"]`, { force: true });
  await s.fill("#goals", "Préparer le bac et viser une prépa PCSI.");
  await s.fill("#budget_max", "50");
  for (const v of ["mon_evening", "wed_afternoon", "sat_morning"]) await s.check(`input[name=availability][value=${v}]`, { force: true });
  await s.click("main button[type=submit]");
  await s.waitForURL("**/tableau-de-bord");
  await s.goto("/enseignants/00000000-0000-4000-8000-000000000001");
  await s.fill("#message", "Bonjour, je suis en Terminale et je voudrais progresser en mécanique avant le bac.");
  await s.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(s.getByText("Demande envoyée")).toBeVisible();

  const t = await (await browser.newContext()).newPage();
  await signIn(t, TEACHER.email, TEACHER.password);
  const row = t.locator("li", { hasText: student.name }).first();
  await row.getByRole("button", { name: "Accepter" }).click();
  await row.getByRole("link", { name: "Écrire" }).click();
  await t.waitForURL("**/messages/*");
  const conversation = new URL(t.url()).pathname;
  for (const [page, text] of [
    [t, "Bonjour Léa ! Ravie de vous accompagner. On commence par la mécanique ?"],
    [s, "Oui, parfait ! Mercredi après-midi, ça vous va ?"],
    [t, "Très bien, je vous propose 14 h 30. Préparez vos questions sur les lois de Newton 🙂"],
  ] as const) {
    await page.goto(conversation);
    await page.getByLabel("Votre message").fill(text);
    await page.keyboard.press("Enter");
    await expect(page.locator("p", { hasText: text })).toBeVisible();
  }
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
  const date = d.toISOString().slice(0, 10);
  await t.goto(conversation);
  await t.fill("#date", date);
  await t.selectOption("#time", "14:30");
  await t.getByRole("button", { name: "Proposer ce créneau" }).click();
  await expect(t.getByText("Cours proposé")).toBeVisible();
  await s.goto(`/calendrier?semaine=${date}`);
  await s.locator("button:visible", { hasText: "Confirmer" }).first().click();
  return { conversation, date };
}

test("captures d'écran des stores", async ({ browser }) => {
  const { conversation, date } = await seedScenario(browser);

  for (const [platform, device] of Object.entries(DEVICES)) {
    const ctx = await browser.newContext({ ...device, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Europe/Paris" });
    const page = await ctx.newPage();
    const shot = async (name: string, path: string, ready: string) => {
      await page.goto(path);
      await page.locator(ready).first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `store/screenshots/${platform}/${name}.png` });
    };
    await shot("1-accueil", "/", "h1");
    await signIn(page, student.email, student.password);
    await shot("2-matchs", "/tableau-de-bord", "text=Vos meilleurs matchs");
    await shot("3-profil-enseignant", "/enseignants/00000000-0000-4000-8000-000000000001", "text=À propos");
    await shot("4-messagerie", conversation, "text=lois de Newton");
    await shot("5-calendrier", `/calendrier?semaine=${date}`, "h1:has-text('Calendrier')");
    await ctx.close();
  }
});
