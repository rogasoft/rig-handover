import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

// Routes read a temp runs dir. runs/ is read-only and never touched here.
let runsDir: string;

const config = (): RigConfig => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

/** Writes runs/<night>.jsonl in the temp dir. Lines are joined with newlines. */
function writeNight(night: string, lines: readonly string[]): void {
  writeFileSync(path.join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

const json = (line: object): string => JSON.stringify(line);

const NIGHT_EMPTY = '2026-10-29';
const NIGHT_ROWS = '2026-10-30';
const NIGHT_BAD = '2026-11-01';
const NIGHT_MISSING = '2026-10-27';

const ROW_LINES = [
  json({ at: '2026-10-30T03:00:00+01:00', job: 'sync-photos', status: 'ok', owner: 'ana' }),
  json({ at: '2026-10-30T02:00:00+01:00', job: 'backup-db', status: 'retry', owner: 'ben', error: 'timeout' }),
  json({ at: '2026-10-30T02:10:00+01:00', job: 'backup-db', status: 'fail', owner: 'ben', error: 'disk full' }),
  json({ at: '2026-10-30T04:00:00+01:00', job: 'digest-mail', status: 'ok', owner: null }),
  json({ at: '2026-10-30T01:00:00+01:00', job: 'flaky-import', status: 'retry', owner: 'cy' }),
  json({ at: '2026-10-30T01:01:00+01:00', job: 'flaky-import', status: 'retry', owner: 'cy' }),
  json({ at: '2026-10-30T01:02:00+01:00', job: 'flaky-import', status: 'retry', owner: 'cy' }),
  json({ at: '2026-10-30T01:03:00+01:00', job: 'flaky-import', status: 'ok', owner: 'cy' }),
  json({ at: '2026-10-30T01:30:00+01:00', job: 'steady-import', status: 'retry', owner: 'di' }),
  json({ at: '2026-10-30T01:31:00+01:00', job: 'steady-import', status: 'retry', owner: 'di' }),
  json({ at: '2026-10-30T01:32:00+01:00', job: 'steady-import', status: 'ok', owner: 'di' }),
];

const JOBS_IN_ORDER = ['backup-db', 'digest-mail', 'flaky-import', 'steady-import', 'sync-photos'];

/**
 * The `<tr>` that holds a job's name in the page. Throws when the job is not
 * on the page, so a missing row fails the test with a readable message.
 */
function rowOf(html: string, job: string): string {
  const at = html.indexOf(job);
  if (at === -1) throw new Error(`job ${job} not on the page`);
  const start = html.lastIndexOf('<tr', at);
  const end = html.indexOf('</tr>', at);
  if (start === -1 || end === -1) throw new Error(`no table row around ${job}`);
  return html.slice(start, end + '</tr>'.length);
}

beforeAll(() => {
  runsDir = mkdtempSync(path.join(os.tmpdir(), 'rig-'));
  writeNight(NIGHT_EMPTY, []);
  writeNight(NIGHT_ROWS, ROW_LINES);
  writeNight(NIGHT_BAD, [
    json({ at: '2026-11-01T02:00:00+01:00', job: 'sync-photos', status: 'ok', owner: 'ana' }),
    'this is not json',
  ]);
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (page)', () => {
  it('404s when the night has no file', async () => {
    const res = await createApp(config()).request(`/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${NIGHT_MISSING}`);
  });

  it('answers 200 with "nothing ran" for an empty night', async () => {
    const res = await createApp(config()).request(`/digest/${NIGHT_EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 200 and names every job on the night', async () => {
    const res = await createApp(config()).request(`/digest/${NIGHT_ROWS}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS_IN_ORDER) expect(html).toContain(job);
  });

  it('marks a row with a fail or 3+ retries as warn, and leaves the rest unmarked', async () => {
    const html = await (await createApp(config()).request(`/digest/${NIGHT_ROWS}`)).text();
    expect(rowOf(html, 'backup-db')).toContain('class="warn"');
    expect(rowOf(html, 'flaky-import')).toContain('class="warn"');
    expect(rowOf(html, 'steady-import')).not.toContain('class="warn"');
    expect(rowOf(html, 'sync-photos')).not.toContain('class="warn"');
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await createApp(config()).request(`/digest/${NIGHT_ROWS}`)).text();
    const row = rowOf(html, 'digest-mail');
    expect(row).toContain('—');
    expect(row).not.toContain('null');
  });

  it('answers 200 and says how many lines did not parse', async () => {
    const res = await createApp(config()).request(`/digest/${NIGHT_BAD}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('1 line did not parse');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('404s with the error body when the night has no file', async () => {
    const res = await createApp(config()).request(`/api/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'no run log', night: NIGHT_MISSING });
  });

  it('answers 200 with no rows and no bad lines for an empty night', async () => {
    const res = await createApp(config()).request(`/api/digest/${NIGHT_EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: NIGHT_EMPTY, rows: [], badLines: 0 });
  });

  it('answers 200 with one DigestRow per job, sorted by job', async () => {
    const res = await createApp(config()).request(`/api/digest/${NIGHT_ROWS}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: DigestRow[]; badLines: number };
    expect(body.night).toBe(NIGHT_ROWS);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS_IN_ORDER);
    expect(body.rows.find((r) => r.job === 'backup-db')).toEqual({
      job: 'backup-db',
      owner: 'ben',
      runs: 2,
      retries: 1,
      lastStatus: 'fail',
      lastError: 'disk full',
      firstAt: '2026-10-30T02:00:00+01:00',
      lastAt: '2026-10-30T02:10:00+01:00',
    } satisfies DigestRow);
    expect(body.rows.find((r) => r.job === 'digest-mail')).toEqual({
      job: 'digest-mail',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-30T04:00:00+01:00',
      lastAt: '2026-10-30T04:00:00+01:00',
    } satisfies DigestRow);
  });

  it('counts a bad line without failing the request', async () => {
    const res = await createApp(config()).request(`/api/digest/${NIGHT_BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: DigestRow[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['sync-photos']);
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the page in the same order as rows[].job', async () => {
    const app = createApp(config());
    const html = await (await app.request(`/digest/${NIGHT_ROWS}`)).text();
    const jsonRes = await app.request(`/api/digest/${NIGHT_ROWS}`);
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as { rows: DigestRow[] };
    const jsonJobs = body.rows.map((r) => r.job);
    const jobsOnPage = [...jsonJobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(jsonJobs.every((j) => html.indexOf(j) !== -1)).toBe(true);
    expect(jobsOnPage).toEqual(jsonJobs);
  });
});
