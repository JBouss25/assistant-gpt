import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, LayoutDashboard, LogOut, MessagesSquare, Search } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { getViewer } from "@/lib/data";
import { Avatar } from "./ui/misc";
import { ButtonLink, buttonClass } from "./ui/button";
import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Accueil Mentora">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/enseignants" className="transition hover:text-foreground">
              Trouver un enseignant
            </Link>
            <Link href="/#fonctionnement" className="transition hover:text-foreground">
              Comment ça marche
            </Link>
            <Link href="/inscription?role=teacher" className="transition hover:text-foreground">
              Devenir enseignant
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/enseignants"
            aria-label="Trouver un enseignant"
            className={buttonClass("ghost", "sm", "px-2 md:hidden")}
          >
            <Search className="size-4" />
          </Link>
          <Suspense fallback={<div className="h-9 w-40" />}>
            <UserArea />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function UserArea() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/connexion" variant="ghost" size="sm">
          Connexion
        </ButtonLink>
        <ButtonLink href="/inscription" size="sm">
          Commencer
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <ButtonLink href="/tableau-de-bord" variant="ghost" size="sm" className="px-2 lg:px-3" aria-label="Tableau de bord">
        <LayoutDashboard className="size-4" />
        <span className="hidden lg:inline">Tableau de bord</span>
      </ButtonLink>
      <ButtonLink href="/messages" variant="ghost" size="sm" className="px-2 lg:px-3" aria-label="Messages">
        <MessagesSquare className="size-4" />
        <span className="hidden lg:inline">Messages</span>
      </ButtonLink>
      <ButtonLink href="/calendrier" variant="ghost" size="sm" className="px-2 lg:px-3" aria-label="Calendrier">
        <CalendarDays className="size-4" />
        <span className="hidden lg:inline">Calendrier</span>
      </ButtonLink>
      <Link href="/profil" aria-label="Mon profil" className="rounded-full focus-visible:outline-2 focus-visible:outline-brand">
        <Avatar name={viewer.profile.full_name || viewer.email} size={34} />
      </Link>
      <form action={signOut}>
        <button type="submit" aria-label="Se déconnecter" title="Se déconnecter" className={buttonClass("ghost", "sm", "px-2")}>
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
