import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="container-page flex flex-col gap-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Logo />
          <p>Les bons enseignants, pour chaque élève, du collège à l&apos;université.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/enseignants" className="hover:text-foreground">Enseignants</Link>
          <Link href="/inscription?role=teacher" className="hover:text-foreground">Enseigner sur Mentora</Link>
          <Link href="/#fonctionnement" className="hover:text-foreground">Fonctionnement</Link>
          <Link href="/confidentialite" className="hover:text-foreground">Confidentialité</Link>
          <Link href="/conditions" className="hover:text-foreground">Conditions</Link>
          <Link href="/support" className="hover:text-foreground">Aide</Link>
        </nav>
      </div>
    </footer>
  );
}
