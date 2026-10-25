import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Accès administrateur à la base LOCALE, pour préparer des données impossibles à créer via l'interface. */
export function adminClient() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key || !/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("Lancez `npm run env:local` : ces tests utilisent la base Supabase locale.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const DEMO = {
  claire: "00000000-0000-4000-8000-000000000001",
  lea: "00000000-0000-4000-8000-000000000101",
  sophie: "00000000-0000-4000-8000-000000000201",
  leaClaireRequest: "00000000-0000-4000-9000-000000000001",
  leaCode: "DEMO2026",
};

/** Cours confirmé et terminé (dans le passé) entre Léa et Claire, prêt pour un compte-rendu. */
export async function createFinishedLesson() {
  const admin = adminClient();
  // Date passée unique pour retrouver le cours dans la liste, sans chevaucher les autres.
  const start = new Date(Date.now() - (3 + Math.floor(Math.random() * 50)) * 864e5);
  start.setUTCHours(5, Math.floor(Math.random() * 4) * 15, 0, 0);
  const ends = new Date(start.getTime() + 90 * 60000);
  const { data, error } = await admin.rpc("e2e_insert_past_lesson", {
    p_request: DEMO.leaClaireRequest,
    p_starts: start.toISOString(),
    p_ends: ends.toISOString(),
  });
  if (error) throw error;
  return { id: data as string, start };
}
