import { defineConfig } from 'vite';
import { promises as fs } from 'fs';
import path from 'path';

/** Recursively delete files in `dir` whose names match `predicate`. */
async function removeFiles(dir: string, predicate: (name: string) => boolean): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await removeFiles(full, predicate);
        // Remove directory if now empty
        const remaining = await fs.readdir(full);
        if (remaining.length === 0) await fs.rmdir(full);
      } else if (predicate(entry.name)) {
        await fs.rm(full);
      }
    })
  );
}

const UNWANTED_EXTENSIONS = new Set(['.xlsx', '.csv', '.js']);
const KEEP_FILES = new Set(['question_bank_2026.csv']);

export default defineConfig({
  root: '.',
  base: '/kaoshi/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'clean-dist-data',
      async closeBundle() {
        // Only clean inside dist/data, not dist/assets (which contains the app bundle)
        await removeFiles(
          path.resolve('dist/data'),
          (name) => UNWANTED_EXTENSIONS.has(path.extname(name)) && !KEEP_FILES.has(name)
        );
        console.log('Cleaned unwanted data files from dist.');
      },
    },
  ],
});
