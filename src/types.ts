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

// Supabase DB row shape — one row per user
export interface UserProgressRow {
  user_id: string; // uuid, primary key
  progress: ProgressBlob;
  updated_at: string; // timestamptz as ISO string
}
