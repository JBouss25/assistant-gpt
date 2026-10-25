// Captures d'écran des stores : base de démo propre, puis parcours réel dans le navigateur.
// Prérequis : npm run db:start && npm run env:local
import { execSync } from "node:child_process";

execSync("npx supabase db reset", { stdio: "inherit" });
execSync("npx playwright test store-screenshots --project=desktop", {
  stdio: "inherit",
  env: { ...process.env, STORE_SCREENSHOTS: "1" },
});
console.log("\nCaptures prêtes dans store/screenshots/ (ios : 1320×2868, android : 1080×2400)");
