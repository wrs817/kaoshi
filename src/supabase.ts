import { createClient } from '@supabase/supabase-js';
import type { UserProgress, UserProgressRow, ProgressBlob } from './types';

export type Database = {
  public: {
    Tables: {
      user_progress: {
        Row: UserProgressRow;
        Insert: UserProgressRow;
        Update: Partial<Omit<UserProgressRow, 'user_id'>>;
      };
    };
  };
};

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] as string;
const SUPABASE_ANON_KEY = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Auth ---

export async function signIn(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// --- User Progress (single row per user, JSON blob) ---

/** Load the user's progress blob and decode it into a Map. */
export async function loadUserProgress(userId: string): Promise<Map<string, UserProgress>> {
  const map = new Map<string, UserProgress>();

  const { data, error } = await supabase
    .from('user_progress')
    .select('progress')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load progress:', error.message);
    return map;
  }
  if (!data) return map;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = (data as any).progress as ProgressBlob;
  for (const [question_id, [practiced_count, wrong_count]] of Object.entries(blob)) {
    map.set(question_id, { question_id, practiced_count, wrong_count });
  }
  return map;
}

/** Encode the full cache to a compact blob and upsert a single row. */
export async function saveAllProgress(
  userId: string,
  cache: Map<string, UserProgress>
): Promise<void> {
  const blob: ProgressBlob = {};
  for (const [id, p] of cache.entries()) {
    if (p.practiced_count > 0 || p.wrong_count > 0) {
      blob[id] = [p.practiced_count, p.wrong_count];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('user_progress') as any).upsert(
    { user_id: userId, progress: blob, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) {
    console.error('Failed to save progress:', error.message, error);
  }
}

/** Delete all progress for the current user. */
export async function deleteAllProgress(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_progress')
    .delete()
    .eq('user_id', userId);
  if (error) console.error('Failed to delete progress:', error.message);
}
