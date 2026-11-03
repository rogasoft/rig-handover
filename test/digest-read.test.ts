import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const dirs: string[] = [];
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);

    const jobs = night.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());

    const refresh = night.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(refresh?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh?.lastAt).toBe('2026-10-29T01:37:00+01:00');

    const backup = night.rows.find((r) => r.job === 'notes/backup');
    expect(backup).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });

    const render = night.rows.find((r) => r.job === 'digest/render');
    expect(render).toBeDefined();
    expect(render?.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('an empty file is an empty night', () => {
    const dir = tempRuns({ '2026-11-01.jsonl': '' });
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('counts bad lines without throwing; blank lines are not lines', () => {
    const good = JSON.stringify({ at: '2026-11-02T01:00:00+01:00', job: 'a/job', status: 'ok', owner: 'rook' });
    const body = [
      good,
      '{not json',
      JSON.stringify({ at: 'x', job: 'b', status: 'weird', owner: 'rook' }),
      JSON.stringify({ at: 'x', job: 'b', status: 'ok' }),
      JSON.stringify({ job: 'b', status: 'ok', owner: null }),
      '',
      '',
    ].join('\n');
    const dir = tempRuns({ '2026-11-02.jsonl': body });
    const night = readNight(dir, '2026-11-02');
    expect(night?.badLines).toBe(4);
    expect(night?.rows.map((r) => r.job)).toEqual(['a/job']);
  });
});
