import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number };

/** Per-line status counts for runs/<night>.jsonl. Bad lines are not counted. `null` when no file. */
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const chunk of text.split('\n')) {
    if (chunk.trim() === '') continue;
    const line = parseLine(chunk);
    if (line) counts[line.status]++;
  }
  return counts;
}
