/**
 * Worker: liefert die API unter /api/* und serviert die statischen Dateien aus /public.
 * Alle externen Daten werden serverseitig geladen und im Edge-Cache gehalten.
 */
import { UpstreamError, parseCoordinates, withCache } from "./lib/http.js";
import { collectIndicators } from "./lib/sources.js";
import { loadLocalClimate, loadLocalCurrent, searchPlaces } from "./lib/local.js";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

function jsonResponse(payload, { status = 200, maxAge = 300 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      ...SECURITY_HEADERS,
    },
  });
}

function errorResponse(error) {
  const status = error instanceof UpstreamError ? error.status : 500;
  const message = status >= 500 && !(error instanceof UpstreamError) ? "Interner Fehler bei der Datenaufbereitung" : error.message;
  return jsonResponse({ error: true, message, status }, { status: status >= 400 && status < 600 ? status : 500, maxAge: 0 });
}

const TTL = {
  indicators: 60 * 60 * 6,
  localCurrent: 60 * 15,
  localClimate: 60 * 60 * 24 * 7,
  geocode: 60 * 60 * 24 * 30,
};

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(new UpstreamError("Nur GET wird unterstützt", 405));
  }

  switch (url.pathname) {
    case "/api/indicators": {
      const payload = await withCache("indicators", TTL.indicators, collectIndicators, { ctx });
      return jsonResponse(payload, { maxAge: 900 });
    }
    case "/api/local/current": {
      const { lat, lon } = parseCoordinates(url);
      const payload = await withCache(
        `local-current/${lat.toFixed(3)}/${lon.toFixed(3)}`,
        TTL.localCurrent,
        () => loadLocalCurrent(lat, lon),
        { ctx },
      );
      return jsonResponse(payload, { maxAge: 300 });
    }
    case "/api/local/climate": {
      const { lat, lon } = parseCoordinates(url);
      const payload = await withCache(
        `local-climate/${lat.toFixed(2)}/${lon.toFixed(2)}`,
        TTL.localClimate,
        () => loadLocalClimate(lat, lon),
        {
          ctx,
          // Eine fehlgeschlagene Projektion (z. B. Rate-Limit beim Anbieter) darf nicht
          // tagelang im Zwischenspeicher liegen, sondern nur wenige Minuten.
          ttlFor: (data) => (data.projection?.error || !data.projection?.ensemble?.length ? 300 : TTL.localClimate),
        },
      );
      return jsonResponse(payload, { maxAge: 3600 });
    }
    case "/api/geocode": {
      const query = url.searchParams.get("q") ?? "";
      if (query.trim().length < 2) return jsonResponse({ results: [] }, { maxAge: 60 });
      const payload = await withCache(`geocode/${query.trim().toLowerCase()}`, TTL.geocode, () => searchPlaces(query), { ctx });
      return jsonResponse(payload, { maxAge: 86400 });
    }
    case "/api/health": {
      return jsonResponse({ status: "ok", date: new Date().toISOString(), environment: env.ENVIRONMENT ?? "development" });
    }
    default:
      return errorResponse(new UpstreamError(`Unbekannter Endpunkt: ${url.pathname}`, 404));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx);
      } catch (error) {
        console.error("API-Fehler", url.pathname, error?.message ?? error);
        return errorResponse(error);
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    // HTML immer revalidieren, Assets mit Hash-ähnlichen Namen dürfen lange gecacht werden.
    if (headers.get("content-type")?.includes("text/html")) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    }
    return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  },
};
