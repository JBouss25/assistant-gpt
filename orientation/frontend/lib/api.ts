// Client HTTP minimal vers l'API FastAPI (relayée par Next sous /api/v1).
import { readStorage, writeStorage } from "./store";

const TOKEN_KEY = "orientation.token";
const USER_KEY = "orientation.user";

export type Role = "student" | "parent" | "counselor" | "school_admin" | "editor" | "committee";
export interface SessionUser {
  id: number;
  email: string;
  role: Role;
  display_name: string;
  establishment_id: number | null;
  onboarded?: boolean;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Erreur ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

export const USER_STORAGE_KEY = USER_KEY;

export function getToken(): string | null {
  return typeof window === "undefined" ? null : readStorage(TOKEN_KEY);
}

export function parseUser(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  return typeof window === "undefined" ? null : parseUser(readStorage(USER_KEY));
}

export function saveSession(token: string, user: SessionUser) {
  writeStorage(TOKEN_KEY, token);
  writeStorage(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  writeStorage(TOKEN_KEY, null);
  writeStorage(USER_KEY, null);
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; text?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.text !== undefined) {
    headers["Content-Type"] = "text/plain";
    body = options.text;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`/api/v1${path}`, { method: options.method ?? (body ? "POST" : "GET"), headers, body });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    clearSession();
    // Session expirée hors du cycle React : rechargement complet volontaire vers l'accueil.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail ?? data;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.detail === "string") return e.detail;
    if (Array.isArray(e.detail)) return e.detail.map((d: { msg?: string }) => d.msg ?? "").join(" ; ");
    const d = e.detail as { message?: string; errors?: string[] };
    if (d?.message) return d.errors ? `${d.message} : ${d.errors.slice(0, 3).join(" ; ")}` : d.message;
  }
  return e instanceof Error ? e.message : "Une erreur est survenue";
}

export function homeFor(role: Role): string {
  return {
    student: "/eleve",
    parent: "/parent",
    counselor: "/conseiller",
    school_admin: "/admin",
    editor: "/backoffice",
    committee: "/backoffice",
  }[role];
}
