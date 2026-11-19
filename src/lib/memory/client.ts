import { getMemoryURL } from '@/lib/config/serverRegistry';

export type MemoryHit = { title: string; summary: string };

// Shared memory service (memory.lan / memserver.py). Failures are always
// non-fatal: research must never block on the memory server being down.
export const recall = async (query: string, limit = 5): Promise<MemoryHit[]> => {
  const base = getMemoryURL();
  if (!base) return [];

  try {
    const res = await fetch(
      `${base}/vec?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      title?: string;
      summary?: string;
      score?: number;
    }>;
    if (!Array.isArray(data)) return [];

    return data
      .filter((e) => e.summary && (e.score ?? 1) >= 0.4)
      .map((e) => ({ title: e.title ?? 'Saved fact', summary: e.summary! }));
  } catch {
    return [];
  }
};

export const remember = async (
  title: string,
  summary: string,
): Promise<{ ok: boolean; message?: string }> => {
  const base = getMemoryURL();
  if (!base) return { ok: false, message: 'Shared memory is not configured' };

  try {
    const res = await fetch(`${base}/store`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        summary,
        tags: ['vane'],
        agent: 'vane',
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? { ok: true } : { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
};
