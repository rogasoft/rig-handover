import { describe, expect, it } from 'vitest';
import { nightCounts } from '../src/digest/counts.js';

describe('nightCounts', () => {
  it('counts parsed lines per status', () => {
    expect(nightCounts('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(nightCounts('runs', '2026-10-27')).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
  it('is null without a file', () => {
    expect(nightCounts('runs', '2000-01-01')).toBeNull();
  });
});
