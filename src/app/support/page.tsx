import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Aide et contact" };

export default function SupportPage() {
  return (
    <LegalPage title="Aide et contact">
      <p>
        Une question, un problème ou un abus à signaler ? Écrivez-nous à{" "}
        <a className="text-brand underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. Nous répondons
        sous 48 h ouvrées.
      </p>

      <h2>Questions fréquentes</h2>
      <p><strong>Comment contacter un enseignant ?</strong> Ouvrez son profil et envoyez une demande. La messagerie s&apos;ouvre dès qu&apos;il l&apos;accepte.</p>
      <p><strong>Combien de temps dure un cours ?</strong> De 1 h 30 à 2 h. L&apos;un propose un créneau dans le calendrier, l&apos;autre le confirme.</p>
      <p><strong>Je ne reçois pas les notifications.</strong> Vérifiez que les notifications de Mentora sont autorisées dans les réglages de votre téléphone.</p>
      <p>
        <strong>Comment supprimer mon compte ?</strong> Page <Link className="text-brand underline" href="/profil">Mon profil</Link>,
        en bas : « Supprimer mon compte ».
      </p>
    </LegalPage>
  );
}
