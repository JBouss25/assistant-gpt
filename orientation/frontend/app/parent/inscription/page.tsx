"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, Field, Notice, inputCls } from "@/components/ui";
import { api, errorMessage, saveSession, type SessionUser } from "@/lib/api";

function ParentRegister() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ display_name: "", email: "", password: "", invite_code: params.get("code") ?? "" });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/register-parent", { body: form });
      saveSession(res.token, res.user);
      router.push("/parent");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-2 text-xl font-semibold">Espace parent — validation de l&apos;inscription</h1>
      <p className="mb-3 text-sm text-slate-600">
        Votre enfant vous a invité. En créant votre compte, vous autorisez, en tant que représentant légal, le traitement de ses données pour l&apos;aide à
        l&apos;orientation (loi 09-08). Vous ne verrez que ce que votre enfant choisira de partager.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Code d'invitation"><input className={inputCls} value={form.invite_code} onChange={(e) => setForm({ ...form, invite_code: e.target.value })} required /></Field>
        <Field label="Nom affiché"><input className={inputCls} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required /></Field>
        <Field label="Adresse e-mail"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum"><input type="password" minLength={8} className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>Je suis le parent ou le représentant légal de cet enfant et j&apos;autorise le traitement de ses données pour l&apos;accompagnement à l&apos;orientation.</span>
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={!accept} className="w-full">Valider et créer mon compte</Button>
      </form>
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ParentRegister />
    </Suspense>
  );
}
