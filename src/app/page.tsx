import { ArrowRight, BadgeCheck, CalendarClock, ChartLine as LineChart, Gauge, GraduationCap, MessageCircle, Search, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, ScoreRing } from "@/components/ui/misc";

const levels = [
  { name: "Collège", detail: "6e → 3e · Brevet", emoji: "🎒" },
  { name: "Lycée", detail: "Seconde → Terminale · Bac", emoji: "📐" },
  { name: "CPGE", detail: "MPSI, PCSI, ECG… · Concours", emoji: "🧪" },
  { name: "Université", detail: "Licence & Master · Partiels", emoji: "🎓" },
];

const steps = [
  {
    icon: GraduationCap,
    title: "Décrivez votre besoin",
    text: "Niveau, matières, objectifs, budget et créneaux : deux minutes suffisent.",
  },
  {
    icon: Sparkles,
    title: "Recevez vos matchs",
    text: "Notre algorithme classe les enseignants selon 6 critères et vous explique pourquoi.",
  },
  {
    icon: MessageCircle,
    title: "Échangez et réservez",
    text: "Une fois la demande acceptée, discutez par messagerie et réservez des cours de 1 h 30 à 2 h dans le calendrier.",
  },
];

const features = [
  {
    icon: Gauge,
    title: "Un score de compatibilité transparent",
    text: "Matières, niveau, disponibilités, budget, format et réputation : chaque recommandation est justifiée.",
  },
  {
    icon: BadgeCheck,
    title: "Des enseignants qui connaissent les programmes",
    text: "Profils détaillés, diplômes et avis d'élèves pour choisir en confiance.",
  },
  {
    icon: LineChart,
    title: "Les parents suivent la progression",
    text: "Après chaque cours, l'enseignant note la séance : élève et parents voient l'évolution en graphiques.",
  },
  {
    icon: CalendarClock,
    title: "Des créneaux qui collent à votre emploi du temps",
    text: "En ligne ou en présentiel, le matching tient compte de vos disponibilités réelles.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
          <div className="absolute top-20 right-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        </div>

        <div className="container-page grid grid-cols-1 items-center gap-14 pt-16 pb-20 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0">
            <Badge tone="brand" className="mb-6 px-3 py-1">
              <Sparkles className="size-3.5" /> Matching intelligent élèves ↔ enseignants
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Le bon enseignant,{" "}
              <span className="bg-linear-to-r from-brand to-accent bg-clip-text text-transparent">au bon moment.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted text-pretty">
              Du collège à la prépa et à l&apos;université, Mentora trouve l&apos;enseignant qui correspond à votre niveau,
              vos objectifs et votre emploi du temps.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/inscription?role=student" size="lg">
                Trouver mon enseignant <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/enseignants" size="lg" variant="secondary">
                <Search className="size-4" /> Parcourir l&apos;annuaire
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-muted">Gratuit pour les élèves · Sans engagement</p>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Niveaux */}
      <section className="container-page">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {levels.map((l) => (
            <div key={l.name} className="rounded-3xl border border-border bg-surface p-5">
              <span className="text-2xl" aria-hidden>
                {l.emoji}
              </span>
              <h3 className="mt-3 font-semibold">{l.name}</h3>
              <p className="text-sm text-muted">{l.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnement */}
      <section id="fonctionnement" className="container-page scroll-mt-24 pt-24">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand">Comment ça marche</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Trois étapes, zéro friction.</h2>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-border bg-surface p-6">
              <span className="absolute top-6 right-6 font-mono text-sm text-muted">0{i + 1}</span>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <s.icon className="size-5" />
              </div>
              <h3 className="mt-5 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Atouts */}
      <section className="container-page pt-24">
        <div className="grid gap-10 rounded-[2rem] bg-foreground p-8 text-background sm:p-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Pensé par des pédagogues, construit pour progresser.
            </h2>
            <p className="mt-4 opacity-70">
              Mentora s&apos;appuie sur les principes du digital learning : personnalisation, transparence et suivi.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4">
                <f.icon className="mt-0.5 size-5 shrink-0 text-band-accent" />
                <div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-1 text-sm opacity-70">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA enseignants */}
      <section className="container-page pt-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-border bg-linear-to-br from-brand-soft to-surface p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Vous enseignez ?</h2>
            <p className="mt-2 max-w-lg text-muted">
              Recevez des demandes d&apos;élèves qui correspondent vraiment à votre expertise. Vous fixez vos tarifs et vos
              créneaux.
            </p>
          </div>
          <ButtonLink href="/inscription?role=teacher" size="lg">
            Créer mon profil enseignant <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

function HeroPreview() {
  const matches = [
    { name: "Claire Dubois", headline: "Agrégée de physique · Prépa PCSI", score: 96, tags: ["Physique-Chimie", "CPGE"] },
    { name: "Karim Haddad", headline: "Ingénieur, maths du lycée au supérieur", score: 88, tags: ["Mathématiques", "Lycée"] },
    { name: "Inès Moreau", headline: "Docteure en biologie, SVT & méthodo", score: 74, tags: ["SVT", "Université"] },
  ];
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-md lg:max-w-none">
      <div className="rounded-[2rem] border border-border bg-surface/80 p-4 shadow-2xl shadow-brand/10 backdrop-blur">
        <div className="flex items-center justify-between px-2 pt-1 pb-4">
          <div>
            <p className="text-xs text-muted">Vos meilleurs matchs</p>
            <p className="font-semibold">Terminale · Spé Physique-Chimie</p>
          </div>
          <Badge tone="success">3 nouveaux</Badge>
        </div>
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.name} className="flex items-center gap-3 rounded-2xl bg-background p-3">
              <Avatar name={m.name} size={42} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted">{m.headline}</p>
                <div className="mt-1.5 flex gap-1">
                  {m.tags.map((t) => (
                    <Badge key={t} className="px-2 text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <ScoreRing score={m.score} size={46} />
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-lg sm:flex">
        <Sparkles className="size-4 text-brand" />
        <span>
          <span className="font-medium">Pourquoi ce match ?</span> <span className="text-muted">4 créneaux en commun</span>
        </span>
      </div>
    </div>
  );
}
