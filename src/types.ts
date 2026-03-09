// The raw question as parsed from CSV
export interface RawQuestion {
  type: 'single' | 'multiple' | 'true-false';
  question: string;
  options: Record<string, string>; // { A: '...', B: '...', ... }
  answer: string; // e.g. "A" or "AB"
}

// A question enriched with a stable ID and per-user stats
export interface Question extends RawQuestion {
  id: string; // e.g. "q_0"
  practiced_count: number;
  wrong_count: number;
  _answeredCorrect?: boolean; // session-only flag, not persisted
}

// Per-question stats stored inside the JSON blob
export interface UserProgress {
  question_id: string;
  practiced_count: number;
  wrong_count: number;
}

// One row per user: progress stored as a compact JSON blob
// { "q_0": [practiced_count, wrong_count], "q_5": [3, 2], ... }
export type ProgressBlob = Record<string, [number, number]>;

// A chapter (one of the 25 individual CSV files)
export interface Chapter {
  id: string;       // e.g. "ch_1"  (stable key for progress namespacing)
  filename: string; // e.g. "data/2026/1、《政府采购法》【100题】.csv"
  title: string;    // display name, e.g. "《政府采购法》【100题】"
}

// Supabase DB row shape — one row per user
export interface UserProgressRow {
  user_id: string; // uuid, primary key
  progress: ProgressBlob;
  updated_at: string; // timestamptz as ISO string
}

// Login event tracking
export interface LoginEvent {
  user_id: string;
  email: string;
  user_agent: string;
  ip_address: string | null;
  device_type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  logged_in_at: string;
}
