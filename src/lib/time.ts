/** Dates et heures de cours, toujours exprimées dans le fuseau Europe/Paris. */

export const TZ = "Europe/Paris";

/** Durées autorisées : de 1 h 30 à 2 h, par pas de 15 min (contrôlé aussi en base). */
export const DURATIONS = [
  { value: 90, label: "1 h 30" },
  { value: 105, label: "1 h 45" },
  { value: 120, label: "2 h" },
] as const;

export const MIN_DURATION = 90;
export const MAX_DURATION = 120;

/** Heures de début proposées : de 8 h à 21 h, toutes les 30 min. */
export const START_TIMES = Array.from({ length: 27 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 23;

export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Décalage (en minutes) entre Paris et UTC à un instant donné. */
export function parisOffsetMinutes(date: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "2026-11-04" + "14:30" (heure de Paris) → instant UTC. */
export function parisToUtc(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Deux passes pour gérer les changements d'heure.
  let ts = asUtc - parisOffsetMinutes(new Date(asUtc)) * 60000;
  ts = asUtc - parisOffsetMinutes(new Date(ts)) * 60000;
  return new Date(ts);
}

/** Composantes de la date à Paris. */
export function parisParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function todayParis(now = new Date()) {
  return parisParts(now).date;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant cette date. */
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const fromMonday = (d.getUTCDay() + 6) % 7;
  return addDays(date, -fromMonday);
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric" });
const rangeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const messageFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const formatDay = (iso: string | Date) => dayFmt.format(new Date(iso));
export const formatMessageDate = (iso: string | Date) => messageFmt.format(new Date(iso));
/** Pour une date calendaire "YYYY-MM-DD". */
export const formatShortDay = (date: string) => shortDayFmt.format(new Date(`${date}T12:00:00Z`));
export const formatLongDate = (date: string) => rangeFmt.format(new Date(`${date}T12:00:00Z`));

/** Instant courant, lu à la requête par les pages serveur. */
export function nowMs() {
  return Date.now();
}
