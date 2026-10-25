import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/** Groupe de pastilles sélectionnables (checkbox ou radio), sans JavaScript côté client. */
export function Chips({
  name,
  options,
  defaultValue = [],
  type = "checkbox",
  required,
}: {
  name: string;
  options: readonly Option[] | readonly string[];
  defaultValue?: readonly string[] | string;
  type?: "checkbox" | "radio";
  required?: boolean;
}) {
  const selected = new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type={type}
            name={name}
            value={o.value}
            defaultChecked={selected.has(o.value)}
            required={required && type === "radio"}
            className="peer sr-only"
          />
          <span
            className={cn(
              "inline-flex h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm transition select-none",
              "hover:border-brand/50 peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand-strong",
              "peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20",
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
