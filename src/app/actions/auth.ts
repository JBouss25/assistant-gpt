"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { FormState } from "./state";

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Indiquez votre nom complet").max(80),
  email: z.email("Adresse e-mail invalide"),
  password: z.string().min(8, "8 caractères minimum"),
  role: z.enum(["student", "teacher", "parent"]),
});

const signInSchema = z.object({
  email: z.email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
  next: z.string().optional(),
});

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** N'accepte que les chemins internes pour éviter les redirections ouvertes. */
function safeNext(next: string | undefined, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

const notConfigured: FormState = {
  error: "Supabase n'est pas configuré. Renseignez les variables d'environnement (voir README).",
};

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return notConfigured;
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { email, password, full_name, role } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, role },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding`,
    },
  });
  if (error) return { error: translateAuthError(error.message) };
  if (!data.session) {
    return { success: "Compte créé ! Confirmez votre adresse via le lien envoyé par e-mail." };
  }
  redirect("/onboarding");
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return notConfigured;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: translateAuthError(error.message) };
  redirect(safeNext(parsed.data.next, "/tableau-de-bord"));
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

function translateAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("already registered")) return "Un compte existe déjà avec cette adresse.";
  if (m.includes("email not confirmed")) return "Confirmez d'abord votre adresse e-mail.";
  if (m.includes("rate limit")) return "Trop de tentatives, réessayez dans quelques minutes.";
  return message;
}
