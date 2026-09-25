// Retries Microsoft Graph sendMail on throttling (429 / ApplicationThrottled)
// and transient 5xx, honouring Retry-After with exponential backoff.
export async function fetchWithGraphRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 4,
): Promise<Response> {
  let res: Response = await fetch(url, init);
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const retryable = res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504;
    if (!retryable) return res;
    const ra = Number(res.headers.get("Retry-After"));
    const waitMs = Math.min(
      Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt,
      15000,
    ) + Math.floor(Math.random() * 500);
    try { await res.text(); } catch (_) { /* drain */ }
    console.warn(`Graph sendMail ${res.status}; retry ${attempt}/${maxAttempts - 1} in ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, init);
  }
  return res;
}
