// Écrit .env.local à partir de l'instance Supabase locale (`npm run db:start` d'abord).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let out;
try {
  out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("Supabase local ne tourne pas. Lancez d'abord : npm run db:start");
  process.exit(1);
}
const vars = Object.fromEntries(
  [...out.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map(([, k, v]) => [k, v]),
);
if (!vars.API_URL || !vars.PUBLISHABLE_KEY) {
  console.error("Impossible de lire l'URL ou la clé Supabase.");
  process.exit(1);
}
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${vars.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${vars.PUBLISHABLE_KEY}\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\n`,
);
console.log(`.env.local écrit (Supabase : ${vars.API_URL})`);
