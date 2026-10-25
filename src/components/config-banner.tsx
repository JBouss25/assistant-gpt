import { isSupabaseConfigured } from "@/lib/supabase/env";

export function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="bg-warning/15 px-4 py-2 text-center text-xs text-foreground">
      Mode démo : configurez <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
      <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> pour activer les comptes.
    </div>
  );
}
