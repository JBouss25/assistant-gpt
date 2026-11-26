"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Notice, inputCls } from "@/components/ui";
import { api, errorMessage, saveSession, type SessionUser } from "@/lib/api";

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ display_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/register", { body: form });
      saveSession(res.token, res.user);
      router.push("/eleve/onboarding");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-3 text-xl font-semibold">Créer mon compte élève</h1>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Prénom (ou pseudo)">
          <input className={inputCls} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required maxLength={100} />
        </Field>
        <Field label="Adresse e-mail">
          <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="Mot de passe" hint="8 caractères minimum">
          <input className={inputCls} type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full">Créer mon compte</Button>
      </form>
    </Card>
  );
}
