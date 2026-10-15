/**
 * Kleine, abhängigkeitsfreie Statistik- und Aggregationshelfer.
 * Alle Funktionen sind rein (kein I/O) und damit direkt testbar.
 */

export function mean(values) {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Kleinste-Quadrate-Regression über Punkte der Form [x, y].
 * Liefert Steigung pro x-Einheit, y-Achsenabschnitt, Bestimmtheitsmaß und Anzahl.
 */
export function linearTrend(points) {
  const pts = points.filter(
    (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  if (pts.length < 3) return { slope: null, intercept: null, r2: null, n: pts.length };
  const n = pts.length;
  const meanX = pts.reduce((a, p) => a + p[0], 0) / n;
  const meanY = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0) return { slope: null, intercept: null, r2: null, n };
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? null : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

/** Zerlegt einen Zeitstempel "YYYY-MM(-DD)" in Jahr und Monat. */
export function splitDate(iso) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso));
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: m[3] ? Number(m[3]) : 1 };
}

/** Dezimaljahr aus Jahr/Monat/Tag (Monat ist 1-basiert). */
export function decimalYear(year, month = 1, day = 1) {
  const daysInYear = isLeap(year) ? 366 : 365;
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return year + (current - start) / 86400000 / daysInYear;
}

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Monatsmittel aus Tageswerten: [{y, m, d, value}] -> [{key, year, month, decimal, value, n}]
 */
export function monthlyMeansFromDaily(daily) {
  const buckets = new Map();
  for (const row of daily) {
    if (!Number.isFinite(row.value)) continue;
    const key = `${row.y}-${String(row.m).padStart(2, "0")}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, year: row.y, month: row.m, sum: 0, n: 0 };
      buckets.set(key, bucket);
    }
    bucket.sum += row.value;
    bucket.n += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      key: b.key,
      year: b.year,
      month: b.month,
      decimal: decimalYear(b.year, b.month, 15),
      value: b.sum / b.n,
      n: b.n,
    }));
}

/** Jahresmittel aus Monatsreihen der Form [{year, key, value}]. */
export function annualMeansFromSeries(series) {
  const buckets = new Map();
  for (const row of series) {
    if (!Number.isFinite(row.value)) continue;
    const year = row.year ?? splitDate(row.key)?.year;
    if (year == null) continue;
    let bucket = buckets.get(year);
    if (!bucket) {
      bucket = { year, sum: 0, n: 0 };
      buckets.set(year, bucket);
    }
    bucket.sum += row.value;
    bucket.n += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => a.year - b.year)
    .map((b) => ({ year: b.year, value: b.sum / b.n, n: b.n }));
}

/**
 * Extreme je Jahr (z. B. September-Minimum, März-Maximum der Meereisausdehnung).
 * mode: "min" | "max"
 */
export function extremesByYear(daily, month, mode = "min") {
  const buckets = new Map();
  for (const row of daily) {
    if (row.m !== month || !Number.isFinite(row.value)) continue;
    const current = buckets.get(row.y);
    if (current === undefined) {
      buckets.set(row.y, row.value);
    } else if (mode === "min" ? row.value < current : row.value > current) {
      buckets.set(row.y, row.value);
    }
  }
  return [...buckets.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
}

/** Gleitender Mittelwert über `window` Monatsschritte, Punkte bleiben auf der Mitte. */
export function runningMean(series, window = 12) {
  if (window < 2) return series.slice();
  const out = [];
  const half = Math.floor(window / 2);
  for (let i = half; i < series.length - (window - half - 1); i += 1) {
    const slice = series.slice(i - half, i + (window - half));
    const value = mean(slice.map((p) => p.value));
    if (value !== null) out.push({ decimal: series[i].decimal, key: series[i].key, year: series[i].year, value });
  }
  return out;
}

/** Dekadenmittel ab einem Startjahr, jeweils volle Dekaden. */
export function decadalMeans(annualSeries) {
  const buckets = new Map();
  for (const row of annualSeries) {
    const decade = Math.floor(row.year / 10) * 10;
    if (!buckets.has(decade)) buckets.set(decade, []);
    buckets.get(decade).push(row.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, values]) => ({ decade, value: mean(values), n: values.length }))
    .filter((d) => d.value !== null);
}

/** Arithmetisches Mittel über einen Jahresbereich (inklusive), `from`/`to` als Jahr. */
export function periodMean(annualSeries, from, to) {
  return mean(
    annualSeries.filter((r) => r.year >= from && r.year <= to).map((r) => r.value),
  );
}

/** Rundung auf n Nachkommastellen (vermeidet -0). */
export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}
