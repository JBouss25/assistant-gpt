import { DAYS, PERIODS } from "@/lib/constants";

/** Grille jours × moments de la journée (checkboxes natives). */
export function AvailabilityGrid({ defaultValue = [] }: { defaultValue?: string[] }) {
  const selected = new Set(defaultValue);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {DAYS.map((d) => (
              <th key={d.value} className="pb-1 font-medium text-muted">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p.value}>
              <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap text-muted">
                {p.label}
              </th>
              {DAYS.map((d) => {
                const slot = `${d.value}_${p.value}`;
                return (
                  <td key={slot}>
                    <label className="block cursor-pointer">
                      <input
                        type="checkbox"
                        name="availability"
                        value={slot}
                        defaultChecked={selected.has(slot)}
                        aria-label={`${d.label} ${p.label}`}
                        className="peer sr-only"
                      />
                      <span className="block h-9 rounded-lg border border-border bg-surface transition hover:border-brand/50 peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20" />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
