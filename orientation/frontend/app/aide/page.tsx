"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

const FALLBACK = [{ q: "Est-ce que la plateforme décide de mon orientation ?", a: "Non. Elle propose des pistes argumentées ; la décision reste la tienne." }];

export default function Help() {
  const [faq, setFaq] = useState<{ q: string; a: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/meta/faq")
      .then((r) => r.json())
      .then(setFaq)
      .catch(() => setFaq(FALLBACK));
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Questions fréquentes</h1>
      <p className="text-slate-600">Le coach conversationnel arrive en V1. En attendant, voici les réponses aux questions les plus courantes.</p>
      {faq.map((f) => (
        <Card key={f.q}>
          <details>
            <summary className="cursor-pointer font-medium">{f.q}</summary>
            <p className="mt-2 text-slate-700">{f.a}</p>
          </details>
        </Card>
      ))}
      <Card>
        <h2 className="font-semibold">Besoin de parler à quelqu&apos;un ?</h2>
        <p className="mt-1 text-slate-700">
          Si tu te sens mal, stressé·e ou harcelé·e, parle à un adulte de confiance de ton établissement (professeur principal, conseiller
          d&apos;orientation, infirmier·ère scolaire). Tu n&apos;as pas à rester seul·e.
        </p>
      </Card>
    </div>
  );
}
