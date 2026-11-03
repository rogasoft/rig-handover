// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl, after parsing. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  /** `null` when the log says so; views render it as `—`. */
  owner: string | null;
  /** Lines logged for this job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  lastStatus: RunStatus;
  /** Error of the last line, `null` when it had none. */
  lastError: string | null;
  /** `at` of the first and last line, offset kept as logged. */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  /** Sorted by job. Empty when the file is empty. */
  rows: DigestRow[];
  /** Lines that did not parse. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads runs/<night>.jsonl. Returns `null` when the night has no file.
 * Implemented in ./read.ts.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
