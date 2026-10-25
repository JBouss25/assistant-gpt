import { test, type Page } from "@playwright/test";
import { DEMO } from "./fixtures";

/**
 * Captures d'écran des fiches App Store / Google Play, depuis l'appli réelle et les données de démo.
 *   npm run store:screenshots   (réinitialise la base locale puis lance ce fichier)
 * Résultat : store/screenshots/{ios,android}/*.png
 */
test.skip(!process.env.STORE_SCREENSHOTS, "Lancer avec npm run store:screenshots");
test.setTimeout(240_000);

const DEVICES = {
  ios: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 }, // 1320 × 2868 (iPhone 6,9")
  android: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 }, // 1080 × 2400
};

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", "mentora-demo");
  await page.click("main button[type=submit]");
  await page.waitForURL("**/tableau-de-bord");
}

test("captures d'écran des stores", async ({ browser }) => {
  for (const [platform, device] of Object.entries(DEVICES)) {
    const ctx = await browser.newContext({ ...device, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Europe/Paris" });
    const page = await ctx.newPage();
    const shot = async (name: string, path: string, ready: string) => {
      await page.goto(path);
      await page.locator(ready).first().waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `store/screenshots/${platform}/${name}.png` });
    };
    await shot("1-accueil", "/", "h1");
    await signIn(page, "lea.bernard@demo.mentora.fr");
    await shot("2-matchs", "/tableau-de-bord", "text=Vos meilleurs matchs");
    await shot("3-profil-enseignant", `/enseignants/${DEMO.claire}`, "text=À propos");
    await shot("4-messagerie", `/messages/${DEMO.leaClaireRequest}`, "text=On commence par la mécanique");
    await shot("5-progression", `/suivi/${DEMO.lea}`, "text=Évolution des notes");
    await signIn(page, "sophie.bernard@demo.mentora.fr");
    await shot("6-espace-parent", "/tableau-de-bord", "text=Dernier compte-rendu");
    await ctx.close();
  }
});
