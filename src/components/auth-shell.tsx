import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-brand-soft/70 to-transparent" />
      <div className="container-page flex justify-center py-16 sm:py-24">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8 rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-brand/5 sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
