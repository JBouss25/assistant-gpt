import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { TeacherCard } from "@/components/teacher-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { LEVELS, MODES, SUBJECTS, type Level, type Mode } from "@/lib/constants";
import { listTeachers, type TeacherFilters } from "@/lib/data";

export const metadata: Metadata = {
  title: "Trouver un enseignant",
  description: "Annuaire des enseignants Mentora : collège, lycée, CPGE et université.",
};

type Search = Awaited<PageProps<"/enseignants">["searchParams"]>;

function parseFilters(sp: Search): TeacherFilters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const level = one(sp.niveau);
  const mode = one(sp.format);
  const subject = one(sp.matiere);
  const max = Number(one(sp.max));
  return {
    q: one(sp.q)?.slice(0, 80),
    subject: SUBJECTS.includes(subject as (typeof SUBJECTS)[number]) ? subject : undefined,
    level: LEVELS.some((l) => l.value === level) ? (level as Level) : undefined,
    mode: MODES.some((m) => m.value === mode) ? (mode as Mode) : undefined,
    maxRate: Number.isFinite(max) && max > 0 ? max : undefined,
  };
}

export default function TeachersPage({ searchParams }: PageProps<"/enseignants">) {
  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Trouver un enseignant</h1>
      <p className="mt-2 text-muted">Filtrez par matière, niveau, format et budget.</p>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/enseignants">, "searchParams">) {
  const filters = parseFilters(await searchParams);
  const teachers = await listTeachers(filters);
  const active = Object.values(filters).some(Boolean);

  return (
    <>
      <form
        method="get"
        className="mt-8 grid gap-3 rounded-3xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr_auto]"
      >
        <Input name="q" placeholder="Mot-clé : bac, agrégé, prépa…" defaultValue={filters.q} aria-label="Mot-clé" />
        <Select name="matiere" defaultValue={filters.subject ?? ""} aria-label="Matière">
          <option value="">Toutes matières</option>
          {SUBJECTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select name="niveau" defaultValue={filters.level ?? ""} aria-label="Niveau">
          <option value="">Tous niveaux</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
        <Select name="format" defaultValue={filters.mode ?? ""} aria-label="Format">
          <option value="">Tous formats</option>
          <option value="online">En ligne</option>
          <option value="in_person">Présentiel</option>
        </Select>
        <Input name="max" type="number" min={5} placeholder="Max €/h" defaultValue={filters.maxRate} aria-label="Tarif maximum" />
        <Button type="submit" className="h-11">
          <SlidersHorizontal className="size-4" /> Filtrer
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm text-muted">
        <span>
          {teachers.length} enseignant{teachers.length > 1 ? "s" : ""}
        </span>
        {active && (
          <ButtonLink href="/enseignants" variant="ghost" size="sm">
            Réinitialiser
          </ButtonLink>
        )}
      </div>

      <div className="mt-4">
        {teachers.length === 0 ? (
          <EmptyState icon={<SearchX className="size-5" />} title="Aucun enseignant trouvé">
            Essayez d&apos;élargir vos filtres.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teachers.map((t) => (
              <TeacherCard key={t.id} teacher={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <>
      <Skeleton className="mt-8 h-20" />
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-60" />
        ))}
      </div>
    </>
  );
}
