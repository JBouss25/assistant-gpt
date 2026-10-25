import type { Level, Mode } from "./constants";

export type Role = "student" | "teacher";
export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  city: string | null;
  avatar_url: string | null;
  onboarded: boolean;
};

export type TeacherProfile = {
  id: string;
  headline: string;
  bio: string;
  subjects: string[];
  levels: Level[];
  hourly_rate: number;
  mode: Mode;
  years_experience: number;
  diplomas: string;
  availability: string[];
  rating_avg: number;
  rating_count: number;
  is_published: boolean;
};

export type StudentProfile = {
  id: string;
  level: Level;
  grade: string;
  subjects: string[];
  goals: string;
  budget_max: number;
  mode: Mode;
  availability: string[];
};

/** Enseignant avec son profil public (jointure profiles). */
export type TeacherCard = TeacherProfile & {
  profile: Pick<Profile, "full_name" | "city" | "avatar_url">;
};

export type MatchRequest = {
  id: string;
  student_id: string;
  teacher_id: string;
  subject: string;
  message: string;
  score: number;
  status: RequestStatus;
  created_at: string;
};

export type Review = {
  id: string;
  teacher_id: string;
  student_id: string;
  rating: number;
  comment: string;
  created_at: string;
};
