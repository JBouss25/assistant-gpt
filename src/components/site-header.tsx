import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, ChartLine, LayoutDashboard, MessagesSquare, Search } from "lucide-react";
import { getViewer } from "@/lib/data";
import { Avatar } from "./ui/misc";
import { ButtonLink, buttonClass } from "./ui/button";
import { Logo } from "./logo";
import { NativeBridge } from "./native-bridge";
import { SignOutButton } from "./sign-out-button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Accueil Mentora">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm whitespace-nowrap text-muted md:flex">
            <Link href="/enseignants" className="transition hover:text-foreground">
              Trouver un enseignant
            </Link>
            <Link href="/#fonctionnement" className="hidden transition hover:text-foreground xl:inline">
              Comment ça marche
            </Link>
            <Link href="/inscription?role=teacher" className="transition hover:text-foreground">
              Devenir enseignant
            </Link>
            <Link href="/inscription?role=parent" className="hidden transition hover:text-foreground lg:inline">
              Parents
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
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
      <div className="flex items-center gap-1 sm:gap-2">
        <NativeBridge signedIn={false} />
        <SearchLink />
        <ButtonLink href="/connexion" variant="ghost" size="sm">
          Connexion
        </ButtonLink>
        <ButtonLink href="/inscription" size="sm">
          Commencer
        </ButtonLink>
      </div>
    );
  }
  const role = viewer.profile.role;
  return (
    <div className="flex items-center gap-1">
      <NativeBridge signedIn />
      {role === "student" && <SearchLink />}
      <NavIcon href="/tableau-de-bord" label="Tableau de bord" icon={<LayoutDashboard className="size-4" />} />
      <NavIcon
        href={role === "student" ? `/suivi/${viewer.id}` : "/suivi"}
        label={role === "parent" ? "Mes enfants" : role === "teacher" ? "Suivi" : "Progression"}
        icon={<ChartLine className="size-4" />}
      />
      {role !== "parent" && (
        <>
          <NavIcon href="/messages" label="Messages" icon={<MessagesSquare className="size-4" />} />
          <NavIcon href="/calendrier" label="Calendrier" icon={<CalendarDays className="size-4" />} />
        </>
      )}
      <Link href="/profil" aria-label="Mon profil" className="rounded-full focus-visible:outline-2 focus-visible:outline-brand">
        <Avatar name={viewer.profile.full_name || viewer.email} size={34} />
      </Link>
      <SignOutButton />
    </div>
  );
}

function NavIcon({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <ButtonLink href={href} variant="ghost" size="sm" className="px-2 2xl:px-3" aria-label={label} title={label}>
      {icon}
      <span className="hidden 2xl:inline">{label}</span>
    </ButtonLink>
  );
}

function SearchLink() {
  return (
    <Link href="/enseignants" aria-label="Trouver un enseignant" className={buttonClass("ghost", "sm", "px-2 md:hidden")}>
      <Search className="size-4" />
    </Link>
  );
}
