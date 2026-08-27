import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TEST-429 (BH-429), satisfying FR-442 and NFR-25.
 *
 * Unlike most tests here, this one guards a property rather than verifying a
 * change: no test in the standard suite may reach a live external service. It
 * is expected to pass the moment it is written. Its value is entirely in
 * failing later — when someone, debugging a stubborn adapter, points a test at
 * the real instance "just to check" and leaves it there.
 *
 * Slice 5 is exactly when that guard earns its keep: it adds a second outbound
 * Jira surface, and the fake adapter that keeps the suite offline is new code
 * with no history of being trusted.
 *
 * The standard suite is unit + contract + acceptance. It excludes `tests/ops`
 * (which drives docker on purpose) and `tests/e2e` (which drives a browser
 * against a locally running stack).
 */

const STANDARD_SUITE = ['tests/unit', 'tests/contract', 'tests/features'];

/**
 * Hosts that mean a test left the machine. `example.*` is deliberately absent:
 * it is the reserved documentation domain and is what the mocked contract tests
 * correctly use as a stand-in.
 */
const LIVE_HOSTS = [
  'tsgjira.atlassian.net',
  'api.atlassian.com',
  'atlassian.net/rest',
  'monex.testrail.net',
  'testrail.net/index.php',
];

/** Environment variables that only ever carry real-service coordinates. */
const LIVE_ENV = ['JIRA_BASE_URL', 'JIRA_API_TOKEN', 'JIRA_EMAIL'];

/**
 * Strips line and block comments. Without this, a comment recording where a
 * fixture shape was captured from reads as a live call — which it is not, and
 * removing such comments to satisfy a checker would make the fixtures less
 * trustworthy, not more.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|feature)$/.test(entry)) out.push(path);
  }
  return out;
};

const standardSuiteFiles = (): string[] => STANDARD_SUITE.flatMap((d) => walk(d));

describe('the standard suite never reaches a live service', () => {
  it('covers a suite that actually has files in it', () => {
    // Without this, every assertion below passes vacuously the day someone
    // moves or renames a test directory.
    const files = standardSuiteFiles();
    expect(files.length).toBeGreaterThan(20);
    for (const dir of STANDARD_SUITE) {
      expect(files.some((f) => f.startsWith(dir))).toBe(true);
    }
  });

  it('names no live external host', () => {
    const offenders: string[] = [];
    for (const file of standardSuiteFiles()) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const host of LIVE_HOSTS) {
        if (text.includes(host)) offenders.push(`${file} → ${host}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads no environment variable that carries real-service credentials', () => {
    const offenders: string[] = [];
    for (const file of standardSuiteFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const name of LIVE_ENV) {
        // `process.env.X` or `process.env['X']` — the two ways to reach it.
        // Not comment-stripped: naming one of these in a test is worth a look
        // even in prose, and no current test does.
        if (
          new RegExp(String.raw`process\.env(\.${name}\b|\[['"\`]${name}['"\`]\])`).test(
            text,
          )
        ) {
          offenders.push(`${file} → ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('constructs the real iteration adapter only where a transport is injected', () => {
    // The real Jira adapters are legitimate to unit-test — the existing
    // contract test does exactly that against undici's MockAgent. What is not
    // legitimate is constructing one without supplying that mocked transport,
    // because it then falls back to the global fetch and leaves the machine.
    const offenders: string[] = [];
    for (const file of standardSuiteFiles()) {
      const text = readFileSync(file, 'utf8');
      const usesRealAdapter = /new (JiraAdapter|IterationAdapter)\b/.test(text);
      if (!usesRealAdapter) continue;
      // Replacing globalThis.fetch counts: credential-redaction.test.ts does
      // exactly that, swapping in a stub and restoring it in a finally block.
      const injectsTransport =
        /MockAgent|undiciFetch|setGlobalDispatcher|fetchImpl|injectedFetch/.test(text) ||
        /globalThis\.fetch\s*=/.test(text);
      if (!injectsTransport) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
