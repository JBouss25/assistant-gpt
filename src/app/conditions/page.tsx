import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation">
      <p>Mentora est édité par {LEGAL.publisher}. En créant un compte, vous acceptez les conditions ci-dessous.</p>

      <h2>Le service</h2>
      <p>
        Mentora aide les élèves à trouver un enseignant et à organiser des cours (messagerie, calendrier). Les cours sont
        convenus directement entre l&apos;élève (ou ses parents) et l&apos;enseignant, qui reste seul responsable de sa prestation
        et de sa déclaration.
      </p>

      <h2>Comptes</h2>
      <ul>
        <li>Les informations de profil doivent être exactes ; un enseignant ne déclare que des diplômes qu&apos;il possède.</li>
        <li>Un élève de moins de 15 ans utilise Mentora avec l&apos;accord d&apos;un parent ou tuteur.</li>
        <li>Vous êtes responsable de la confidentialité de votre mot de passe.</li>
      </ul>

      <h2>Comportement</h2>
      <p>
        Sont interdits : propos injurieux, harcèlement, contenus inappropriés, sollicitation d&apos;un mineur hors du cadre
        pédagogique, spam. Signalez tout abus à {LEGAL.contactEmail} : nous pouvons suspendre ou supprimer un compte.
      </p>

      <h2>Avis</h2>
      <p>Seuls les élèves ayant eu une demande acceptée peuvent laisser un avis. Les avis doivent être sincères.</p>

      <h2>Résiliation</h2>
      <p>Vous pouvez supprimer votre compte à tout moment depuis la page Mon profil.</p>

      <h2>Droit applicable</h2>
      <p>Ces conditions sont soumises au droit français.</p>
    </LegalPage>
  );
}
