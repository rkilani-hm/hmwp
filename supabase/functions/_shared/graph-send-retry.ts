// Retries Microsoft Graph sendMail on throttling (429 / ApplicationThrottled)
// and transient 5xx, honouring Retry-After with exponential backoff.
// Pass a `stats` object to capture per-attempt telemetry for logging.
export interface GraphAttempt {
  attempt: number;
  status: number;
  at: string;
  throttled: boolean;
  wait_ms?: number;
}
export interface GraphRetryStats {
  attempts: GraphAttempt[];
  throttleCount: number;
  lastStatus: number | null;
}
export function newGraphRetryStats(): GraphRetryStats {
  return { attempts: [], throttleCount: 0, lastStatus: null };
}

export async function fetchWithGraphRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 4,
  stats?: GraphRetryStats,
): Promise<Response> {
  const record = (attempt: number, res: Response, wait_ms?: number) => {
    if (!stats) return;
    const throttled = res.status === 429;
    if (throttled) stats.throttleCount++;
    stats.lastStatus = res.status;
    stats.attempts.push({ attempt, status: res.status, at: new Date().toISOString(), throttled, wait_ms });
  };
  let res: Response = await fetch(url, init);
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const retryable = res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504;
    if (!retryable) { record(attempt, res); return res; }
    const ra = Number(res.headers.get("Retry-After"));
    const waitMs = Math.min(
      Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt,
      15000,
    ) + Math.floor(Math.random() * 500);
    record(attempt, res, waitMs);
    try { await res.text(); } catch (_) { /* drain */ }
    console.warn(`Graph sendMail ${res.status}; retry ${attempt}/${maxAttempts - 1} in ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, init);
  }
  record(maxAttempts, res);
  return res;
}
