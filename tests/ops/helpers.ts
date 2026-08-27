import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const compose = async (...args: string[]): Promise<string> => {
  const { stdout } = await run('docker', ['compose', ...args], {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
};

/** Polls until the board answers healthy, or gives up. */
export const waitForHealthy = async (timeoutMs = 120_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'never attempted';
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/health');
      if (res.ok) {
        const body = (await res.json()) as { status: string; database: string };
        if (body.status === 'ok' && body.database === 'ok') return;
        lastError = `status=${body.status} database=${body.database}`;
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (error) {
      lastError = (error as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Board never became healthy within ${timeoutMs}ms. Last: ${lastError}`);
};

export const getBoard = async (): Promise<{
  columns: {
    id: number;
    key: string;
    name: string;
    cards: { id: string; title: string }[];
  }[];
}> => {
  const res = await fetch('http://127.0.0.1:3000/api/board');
  if (!res.ok) throw new Error(`GET /api/board returned ${res.status}`);
  return res.json();
};

export const createCard = async (title: string): Promise<{ id: string }> => {
  const res = await fetch('http://127.0.0.1:3000/api/cards', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (res.status !== 201) throw new Error(`POST /api/cards returned ${res.status}`);
  return res.json();
};

export const moveCard = async (
  id: string,
  toColumnId: number,
  toIndex = 1,
): Promise<void> => {
  const res = await fetch(`http://127.0.0.1:3000/api/cards/${id}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ toColumnId, toIndex }),
  });
  if (!res.ok) throw new Error(`move returned ${res.status}`);
};
