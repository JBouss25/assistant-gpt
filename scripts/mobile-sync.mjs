// Prépare la coque mobile puis synchronise les projets Android / iOS.
//   npm run mobile:sync                          → site de production
//   MOBILE_APP_URL=http://10.0.2.2:3000 npm run mobile:sync → serveur local (émulateur Android)
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.MOBILE_APP_URL ?? "https://mentora.vercel.app";
if (!/^https?:\/\/[^\s"<>]+$/.test(url)) {
  console.error(`URL invalide : ${url}`);
  process.exit(1);
}
if (url.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)/.test(url)) {
  console.error("En production, l'appli doit charger une URL en https.");
  process.exit(1);
}

const html = readFileSync("mobile/offline.template.html", "utf8").replaceAll("__APP_URL__", url);
mkdirSync("mobile/www", { recursive: true });
writeFileSync("mobile/www/offline.html", html);
writeFileSync("mobile/www/index.html", html);

console.log(`Appli mobile → ${url}`);
execSync("npx cap sync", { stdio: "inherit", env: { ...process.env, MOBILE_APP_URL: url } });
