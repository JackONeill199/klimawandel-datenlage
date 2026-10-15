/** HTTP-Helfer mit Timeouts und Worker-Cache (Cache API) für Upstream-Daten. */

export class UpstreamError extends Error {
  constructor(message, status = 502, url = "") {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.url = url;
  }
}

const DEFAULT_TIMEOUT = 15000;

/** Statuscodes, bei denen ein erneuter Versuch sinnvoll ist (Rate-Limit, kurzfristige Störung). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT, headers = {}, retries = 0, retryDelayMs = 1500 } = {}) {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "klimawandel-datenlage/0.1 (Informationsseite; Datenabruf)", ...headers },
        signal: controller.signal,
      });
      if (response.ok) return await response.text();
      if (retries > 0 && attempt < retries && RETRYABLE.has(response.status)) {
        await sleep(retryDelayMs * (attempt + 1));
        attempt += 1;
        continue;
      }
      const reason = response.status === 429 ? "Rate-Limit des Anbieters erreicht" : `Upstream antwortete mit ${response.status}`;
      throw new UpstreamError(reason, 502, url);
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      if (retries > 0 && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        attempt += 1;
        continue;
      }
      const reason = error?.name === "AbortError" ? `Zeitüberschreitung nach ${timeoutMs} ms` : String(error?.message ?? error);
      throw new UpstreamError(reason, 504, url);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError("Upstream lieferte kein gültiges JSON", 502, url);
  }
}

const CACHE_ORIGIN = "https://cache.klimawandel-datenlage.internal";

/**
 * Legt das Ergebnis von `producer` für `ttlSeconds` in der Cache API ab.
 * Cache-Treffer werden nicht erneut berechnet, sodass Upstream-Limits geschont bleiben.
 */
export async function withCache(key, ttlSeconds, producer, { ctx, ttlFor } = {}) {
  const cacheKey = new Request(`${CACHE_ORIGIN}/${key}`, { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const payload = await hit.json();
    payload.cached = { hit: true, ageSeconds: cacheAge(hit.headers.get("age")) };
    return payload;
  }
  const payload = await producer();
  // Teilweise fehlgeschlagene Antworten (z. B. gestörtes Rate-Limit) nur kurz halten.
  const effectiveTtl = ttlFor ? ttlFor(payload) : ttlSeconds;
  const response = new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${effectiveTtl}`,
      age: "0",
    },
  });
  const put = cache.put(cacheKey, response);
  if (ctx?.waitUntil) ctx.waitUntil(put);
  else await put.catch(() => {});
  payload.cached = { hit: false, ageSeconds: 0, ttlSeconds: effectiveTtl };
  return payload;
}

function cacheAge(header) {
  const seconds = Number.parseInt(header ?? "0", 10);
  return Number.isFinite(seconds) ? seconds : 0;
}

/** Gültige Koordinaten erzwingen (Open-Meteo würde sonst stillschweigend runden). */
export function parseCoordinates(url) {
  const lat = Number.parseFloat(url.searchParams.get("lat") ?? "");
  const lon = Number.parseFloat(url.searchParams.get("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new UpstreamError("Parameter lat und lon sind erforderlich", 400);
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new UpstreamError("Koordinaten außerhalb des gültigen Bereichs", 400);
  }
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}
