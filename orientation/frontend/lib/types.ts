export type Category = "A" | "B" | "C";

export interface RefSummary {
  id: string;
  short: string;
  name: string;
  type: string;
}

export interface Occupation {
  id: string;
  name: string;
  family: string;
  avenir: number;
  D: number;
  H: number;
  A: number;
  M: number;
  as_of: string;
  source_ids: string[];
}

export interface Item {
  program_id: string;
  name: string;
  short: string;
  type: "track" | "program";
  sector: string;
  category: Category;
  category_label: string;
  exploratory: boolean;
  fit_score: { low: number; high: number; value: number; label: string };
  admission_probability: {
    low: number;
    high: number;
    value: number;
    selective: boolean;
    source_id: string | null;
    as_of: string | null;
    exam: string | null;
    open_access: boolean;
  };
  contributions: Record<string, number>;
  contribution_points: Record<string, number>;
  components: Record<string, number>;
  reasons: string[];
  ai_impact: {
    occupation_id: string;
    occupation_name: string;
    automated: string[];
    augmented: string[];
    human_core: string[];
    transformation: { a: number; b: number; c: number };
  };
  occupations: Occupation[];
  avenir: number;
  prerequisites: string[];
  bridges: string[];
  bridges_details: RefSummary[];
  leads_to_details: RefSummary[];
  cost: { annual_min: number; annual_max: number; currency: string; note?: string; as_of: string; source_id: string } | null;
  duration_years: number;
  cities: string[];
  flags: { type: string; message: string }[];
  evidence_used: string[];
  citations: string[];
  counterfactual: string;
  roadmap_6_12m: string[];
}

export interface Recommendation {
  run_id: number;
  created_at: string;
  student_ref: string;
  system: string;
  level: string;
  model_version: string;
  weights_version: string;
  referential_version: string;
  weights: Record<string, number>;
  items: Item[];
  blocked: { program_id: string; short: string; message: string; bridges_details: RefSummary[]; alternatives_details: RefSummary[] }[];
  signals: { type: string; message: string; program_id: string | null }[];
  warnings: { type: string; message: string }[];
  disclaimer: string;
  explanation_meta: { provider: string; status: string; prompt_version: string };
  changes?: { program_id: string; short: string; from: Category | null; to: Category | null; explanation: string }[];
}

export interface Source {
  id: string;
  title: string;
  url: string | null;
  as_of: string;
  reliability: string;
}

export interface Meta {
  levels: Record<string, { system: "MA" | "FR"; label: string }>;
  streams: Record<string, { id: string; label: string }[]>;
  fr_specialties: { id: string; label: string }[];
  subjects: Record<string, string>;
  level_subjects: Record<string, string[]>;
  domains: Record<string, string>;
  mvp_levels: string[];
}

export const COMPONENT_LABELS: Record<string, string> = {
  interests: "Tes intérêts",
  skills: "Tes compétences",
  values: "Tes valeurs",
  feasibility: "Faisabilité",
  outlook: "Avenir +5",
  evidence: "Tes preuves",
};
