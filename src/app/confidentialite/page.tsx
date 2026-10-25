import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Mentora met en relation des élèves et des enseignants. Cette page explique quelles données nous traitons, pourquoi, et
        comment exercer vos droits, conformément au RGPD.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        {LEGAL.publisher}, {LEGAL.address}. Contact : <a className="text-brand underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>

      <h2>Données collectées</h2>
      <ul>
        <li>Compte : nom, adresse e-mail, mot de passe (chiffré, jamais lisible par nous), rôle élève ou enseignant.</li>
        <li>Profil élève : niveau, classe, matières, objectifs, budget, format souhaité, disponibilités, ville.</li>
        <li>Profil enseignant : présentation, diplômes, matières, niveaux, tarif, disponibilités, ville.</li>
        <li>Activité : demandes de mise en relation, messages, cours réservés, avis.</li>
        <li>Appli mobile : identifiant technique de notification de votre appareil, si vous acceptez les notifications.</li>
      </ul>
      <p>Nous ne collectons ni votre position GPS, ni vos contacts, ni de données publicitaires. Aucune donnée n&apos;est vendue.</p>

      <h2>Finalités et bases légales</h2>
      <ul>
        <li>Fournir le service (compte, matching, messagerie, calendrier) : exécution du contrat.</li>
        <li>Vous notifier d&apos;un message ou d&apos;un cours : votre consentement, retirable dans les réglages du téléphone.</li>
        <li>Sécurité et prévention des abus : intérêt légitime.</li>
      </ul>

      <h2>Qui voit vos données ?</h2>
      <ul>
        <li>Les profils enseignants publiés sont visibles de tous.</li>
        <li>Le profil d&apos;un élève n&apos;est visible que des enseignants qu&apos;il a contactés.</li>
        <li>Les messages et cours ne sont visibles que des deux participants.</li>
        <li>Sous-traitants techniques : {LEGAL.hosting} ; Google Firebase pour l&apos;acheminement des notifications.</li>
      </ul>

      <h2>Mineurs</h2>
      <p>
        Mentora s&apos;adresse notamment à des collégiens et lycéens. En France, un élève de moins de 15 ans doit obtenir
        l&apos;accord d&apos;un parent ou tuteur pour créer un compte. Les parents peuvent nous écrire pour accéder aux données
        de leur enfant ou les faire supprimer.
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte existe. Elles sont supprimées dès que vous supprimez votre compte.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les rectifier (page <Link className="text-brand underline" href="/profil">Mon profil</Link>),
        les exporter ou vous opposer à un traitement en écrivant à {LEGAL.contactEmail}. Vous pouvez{" "}
        <strong>supprimer votre compte à tout moment</strong> depuis la page Mon profil, dans l&apos;appli comme sur le site.
        Vous pouvez aussi saisir la CNIL (cnil.fr).
      </p>
    </LegalPage>
  );
}
