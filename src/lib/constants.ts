export const LEVELS = [
  { value: "college", label: "Collège", grades: ["6e", "5e", "4e", "3e"] },
  { value: "lycee", label: "Lycée", grades: ["Seconde", "Première", "Terminale"] },
  {
    value: "cpge",
    label: "CPGE",
    grades: ["MPSI", "PCSI", "MP2I", "PTSI", "BCPST", "ECG", "MP", "PC", "PSI", "PT", "Khâgne / Hypokhâgne"],
  },
  { value: "universite", label: "Université", grades: ["L1", "L2", "L3", "M1", "M2"] },
] as const;

export type Level = (typeof LEVELS)[number]["value"];

export const LEVEL_LABEL: Record<Level, string> = Object.fromEntries(
  LEVELS.map((l) => [l.value, l.label]),
) as Record<Level, string>;

export const SUBJECTS = [
  "Mathématiques",
  "Physique-Chimie",
  "SVT",
  "Français",
  "Philosophie",
  "Histoire-Géographie",
  "Anglais",
  "Espagnol",
  "Allemand",
  "SES",
  "NSI / Informatique",
  "Économie",
  "Méthodologie",
] as const;

export const MODES = [
  { value: "online", label: "En ligne" },
  { value: "in_person", label: "En présentiel" },
  { value: "both", label: "Les deux" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

export const MODE_LABEL: Record<Mode, string> = {
  online: "En ligne",
  in_person: "Présentiel",
  both: "En ligne & présentiel",
};

export const DAYS = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Jeu" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sam" },
  { value: "sun", label: "Dim" },
] as const;

export const PERIODS = [
  { value: "morning", label: "Matin" },
  { value: "afternoon", label: "Après-midi" },
  { value: "evening", label: "Soir" },
] as const;

/** Créneaux de disponibilité, ex. "wed_afternoon". */
export const SLOTS = DAYS.flatMap((d) => PERIODS.map((p) => `${d.value}_${p.value}`));
