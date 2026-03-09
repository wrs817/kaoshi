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
        // Only remove .xlsx files from dist/data (keep all CSVs needed at runtime)
        await removeFiles(
          path.resolve('dist/data'),
          (name) => path.extname(name) === '.xlsx'
        );
        console.log('Cleaned unwanted data files from dist.');
      },
    },
  ],
});
