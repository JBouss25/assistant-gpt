// Tests des règles de sécurité de la base (RLS, triggers, fonctions) dans un Postgres embarqué (PGlite).
// Chaque fichier reçoit les migrations à appliquer ; aucun Docker nécessaire.  →  npm run test:db
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
const upTo = (prefix) => all.filter((f) => f.split("/").pop() <= `${prefix}~`);

const suites = [
  ["01-init.mjs", upTo("20261025000000")],
  ["02-messages-lessons.mjs", upTo("20261026000000")],
  ["03-mobile.mjs", all],
  ["04-moderation.mjs", all],
  ["05-parents-progress.mjs", all],
];

let failed = 0;
let passed = 0;
for (const [file, migrations] of suites) {
  let out = "";
  try {
    out = execFileSync("node", [join("supabase/tests", file), ...migrations], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    out = `${error.stdout ?? ""}FAIL ${file} a planté : ${error.stderr ?? error.message}`;
  }
  const lines = out.split("\n").filter((l) => /^(PASS|FAIL)/.test(l));
  passed += lines.filter((l) => l.startsWith("PASS")).length;
  const fails = lines.filter((l) => l.startsWith("FAIL"));
  failed += fails.length;
  console.log(`${fails.length ? "✘" : "✓"} ${file} (${lines.length} vérifications)`);
  fails.forEach((l) => console.log(`    ${l}`));
}
console.log(`\n${passed} réussies, ${failed} en échec`);
process.exit(failed ? 1 : 0);
