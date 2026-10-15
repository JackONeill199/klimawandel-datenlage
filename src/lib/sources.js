/**
 * Zusammenführung der globalen Klimaindikatoren aus öffentlichen Live-Quellen.
 * Jede Quelle wird einzeln fehlertolerant geladen: Fällt eine Quelle aus,
 * liefert die Seite die übrigen Indikatoren weiterhin aus.
 */
import {
  findSeaLevelRelease,
  parseCo2Annual,
  parseCo2GlobalTrend,
  parseCo2Monthly,
  parseCo2Weekly,
  parseGasMonthly,
  parseGistemp,
  parseSeaIceClimatology,
  parseSeaIceDaily,
  parseSeaLevelText,
} from "./parse.js";
import { fetchJson, fetchText, withCache } from "./http.js";
import {
  annualMeansFromSeries,
  decadalMeans,
  decimalYear,
  extremesByYear,
  linearTrend,
  mean,
  monthlyMeansFromDaily,
  periodMean,
  round,
} from "./stats.js";

const GML = "https://gml.noaa.gov/webdata/ccgg/trends";

/** NASA/GISS: Umrechnung der GISTEMP-Anomalien (1951–1980) auf 1850–1900 (FAQ, Stand Januar 2025). */
export const GISTEMP_PREINDUSTRIAL_OFFSET_C = 0.19;

export const REFERENCE_PERIODS = {
  gistempBaseline: "1951–1980",
  preindustrial: "1850–1900",
  seaIceClimatology: "1981–2010",
};

export const SOURCE_DEFS = {
  co2: {
    id: "noaa-co2-mlo",
    label: "CO₂-Konzentration, Mauna Loa (monatlich, wöchentlich, Jahresmittel)",
    provider: "NOAA Global Monitoring Laboratory",
    cadence: "wöchentlich bis monatlich",
    license: "Public Domain (US-Bundesdaten)",
    homepage: "https://gml.noaa.gov/ccgg/trends/",
    station: "Mauna Loa Observatory, Hawaii (3.397 m)",
  },
  co2Global: {
    id: "noaa-co2-global",
    label: "Globale CO₂-Konzentration (geglättete Zeitreihe)",
    provider: "NOAA Global Monitoring Laboratory",
    cadence: "monatlich",
    license: "Public Domain (US-Bundesdaten)",
    homepage: "https://gml.noaa.gov/ccgg/trends/gl_data.html",
  },
  temperature: {
    id: "nasa-gistemp",
    label: "Globale Temperaturanomalie, Land und Ozean (GISTEMP v4)",
    provider: "NASA Goddard Institute for Space Studies",
    cadence: "monatlich",
    license: "Public Domain (US-Bundesdaten)",
    homepage: "https://data.giss.nasa.gov/gistemp/",
  },
  methane: {
    id: "noaa-ch4-global",
    label: "Methankonzentration, globales Messnetz (monatlich)",
    provider: "NOAA Global Monitoring Laboratory",
    cadence: "monatlich",
    license: "Public Domain (US-Bundesdaten)",
    homepage: "https://gml.noaa.gov/ccgg/trends_ch4/",
  },
  nitrousOxide: {
    id: "noaa-n2o-global",
    label: "Lachgas­konzentration, globales Messnetz (monatlich)",
    provider: "NOAA Global Monitoring Laboratory",
    cadence: "monatlich",
    license: "Public Domain (US-Bundesdaten)",
    homepage: "https://gml.noaa.gov/ccgg/trends_n2o/",
  },
  seaIce: {
    id: "nsidc-sea-ice-index",
    label: "Meereisausdehnung Arktis, täglich (Sea Ice Index v4.0)",
    provider: "National Snow and Ice Data Center (NSIDC), NOAA-gefördert",
    cadence: "täglich",
    license: "Frei nutzbar mit Quellenangabe",
    homepage: "https://nsidc.org/data/g02135",
  },
  seaLevel: {
    id: "cu-sea-level",
    label: "Globaler Meeresspiegel aus Satellitenaltimetrie",
    provider: "Sea Level Research Group, University of Colorado Boulder",
    cadence: "etwa alle 10 Tage, neue Release-Version mehrfach jährlich",
    license: "Frei nutzbar mit Quellenangabe",
    homepage: "https://sealevel.colorado.edu/",
  },
};

function monthsBetween(fromKey, toKey) {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function trimmedTail(series, count) {
  return series.slice(Math.max(0, series.length - count));
}

async function loadCo2() {
  const [monthlyText, weeklyText, annualText, growthText, globalText] = await Promise.all([
    fetchText(`${GML}/co2/co2_mm_mlo.csv`),
    fetchText(`${GML}/co2/co2_weekly_mlo.csv`),
    fetchText(`${GML}/co2/co2_annmean_mlo.csv`),
    fetchText(`${GML}/co2/co2_gr_mlo.csv`),
    fetchText(`${GML}/co2/co2_trend_gl.csv`),
  ]);

  const monthly = parseCo2Monthly(monthlyText).filter((row) => row.value !== null && row.decimal !== null);
  const weekly = parseCo2Weekly(weeklyText).filter((row) => row.value !== null);
  const annual = parseCo2Annual(annualText);
  const growth = parseCo2Annual(growthText);
  const globalTrend = parseCo2GlobalTrend(globalText).filter((row) => row.trend !== null);

  const latestWeekly = weekly[weekly.length - 1] ?? null;
  const latestMonthly = monthly[monthly.length - 1] ?? null;
  const lastFullYearMonthly = monthly.filter((row) => row.year < new Date().getUTCFullYear());
  const annualFromMonthly = annualMeansFromSeries(lastFullYearMonthly);
  const lastAnnual = annualFromMonthly[annualFromMonthly.length - 1] ?? null;

  // Trend der letzten 120 Monate in ppm pro Dekade
  const window = trimmedTail(monthly, 120).map((row) => [row.decimal, row.value]);
  const trend = linearTrend(window);

  return {
    key: "co2",
    def: SOURCE_DEFS.co2,
    dataUrl: `${GML}/co2/co2_mm_mlo.csv`,
    lastObservation: latestWeekly ? `${latestWeekly.year}-${pad(latestWeekly.month)}-${pad(latestWeekly.day)}` : null,
    points: monthly.length + weekly.length + annual.length,
    payload: {
      unit: "ppm",
      monthly: monthly.map((row) => [round(row.decimal, 5), round(row.value, 2), round(row.seasonalAdjusted, 2)]),
      annual: annual.map((row) => [row.year, round(row.value, 2), round(row.uncertainty, 2)]),
      growthRate: growth.map((row) => [row.year, round(row.value, 2), round(row.uncertainty, 2)]),
      weeklyRecent: trimmedTail(weekly, 104).map((row) => [
        `${row.year}-${pad(row.month)}-${pad(row.day)}`,
        round(row.value, 2),
        round(row.yearAgo, 2),
        round(row.since1800, 2),
      ]),
      globalTrend: trimmedTail(globalTrend, 240).map((row) => [
        round(decimalYear(row.year, row.month, 1), 5),
        round(row.trend, 2),
      ]),
      stats: {
        latest: latestWeekly
          ? {
              date: `${latestWeekly.year}-${pad(latestWeekly.month)}-${pad(latestWeekly.day)}`,
              value: round(latestWeekly.value, 2),
              yearAgo: round(latestWeekly.yearAgo, 2),
              decadeAgo: round(latestWeekly.decadeAgo, 2),
              since1800: round(latestWeekly.since1800, 2),
              increaseVsYearAgo:
                latestWeekly.yearAgo !== null ? round(latestWeekly.value - latestWeekly.yearAgo, 2) : null,
            }
          : null,
        latestMonthly: latestMonthly
          ? {
              date: `${latestMonthly.year}-${pad(latestMonthly.month)}`,
              value: round(latestMonthly.value, 2),
              seasonalAdjusted: round(latestMonthly.seasonalAdjusted, 2),
            }
          : null,
        lastFullYear: lastAnnual ? { year: lastAnnual.year, value: round(lastAnnual.value, 2) } : null,
        growthLastFullYear: growth.length
          ? { year: growth[growth.length - 1].year, value: round(growth[growth.length - 1].value, 2) }
          : null,
        trendPerDecade: trend.slope !== null ? round(trend.slope * 10, 2) : null,
        trendWindowMonths: window.length,
        preindustrialReference: 278,
        monthlyCoverage: monthly.length ? `${monthly[0].year}–${monthly[monthly.length - 1].year}` : null,
      },
    },
  };
}

async function loadCo2Global() {
  const text = await fetchText(`${GML}/co2/co2_trend_gl.csv`);
  const rows = parseCo2GlobalTrend(text).filter((row) => row.trend !== null);
  const last = rows[rows.length - 1] ?? null;
  return {
    key: "co2Global",
    def: SOURCE_DEFS.co2Global,
    dataUrl: `${GML}/co2/co2_trend_gl.csv`,
    lastObservation: last ? `${last.year}-${pad(last.month)}` : null,
    points: rows.length,
    payload: {
      unit: "ppm",
      series: trimmedTail(rows, 480).map((row) => [round(decimalYear(row.year, row.month, 1), 5), round(row.trend, 2)]),
      stats: last ? { date: `${last.year}-${pad(last.month)}`, value: round(last.trend, 2) } : null,
    },
  };
}

async function loadTemperature() {
  const text = await fetchText("https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv");
  const { monthly, annual } = parseGistemp(text);
  const withDecimal = monthly.map((row) => ({ ...row, decimal: decimalYear(row.year, row.month, 15) }));
  const last = withDecimal[withDecimal.length - 1] ?? null;
  const lastTwelve = trimmedTail(withDecimal, 12);
  const previousTwelve = withDecimal.slice(Math.max(0, withDecimal.length - 24), Math.max(0, withDecimal.length - 12));
  const currentYear = new Date().getUTCFullYear();
  const fullYears = annual.filter((row) => row.year < currentYear);
  const warmest = [...annual].sort((a, b) => b.value - a.value)[0] ?? null;

  return {
    key: "temperature",
    def: SOURCE_DEFS.temperature,
    dataUrl: "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv",
    lastObservation: last ? `${last.year}-${pad(last.month)}` : null,
    points: monthly.length,
    payload: {
      unit: "°C",
      baseline: REFERENCE_PERIODS.gistempBaseline,
      monthly: withDecimal.map((row) => [round(row.decimal, 5), round(row.value, 2)]),
      annual: annual.map((row) => [row.year, round(row.value, 2)]),
      stats: {
        latest: last ? { date: `${last.year}-${pad(last.month)}`, value: round(last.value, 2) } : null,
        lastTwelveMonths:
          lastTwelve.length === 12
            ? {
                from: `${lastTwelve[0].year}-${pad(lastTwelve[0].month)}`,
                to: `${lastTwelve[lastTwelve.length - 1].year}-${pad(lastTwelve[lastTwelve.length - 1].month)}`,
                value: round(mean(lastTwelve.map((row) => row.value)), 2),
              }
            : null,
        lastFullYear: fullYears.length
          ? { year: fullYears[fullYears.length - 1].year, value: round(fullYears[fullYears.length - 1].value, 2) }
          : null,
        warmestYear: warmest ? { year: warmest.year, value: round(warmest.value, 2) } : null,
        decades: decadalMeans(fullYears)
          .slice(-6)
          .map((row) => ({ decade: row.decade, value: round(row.value, 2) })),
        preindustrialOffset: GISTEMP_PREINDUSTRIAL_OFFSET_C,
        firstYear: annual.length ? annual[0].year : null,
      },
    },
  };
}

async function loadGas(key, def, file, unit) {
  const text = await fetchText(`${GML}/${file}`);
  const rows = parseGasMonthly(text).filter((row) => row.value !== null);
  const withDecimal = rows.map((row) => ({ ...row, decimal: row.decimal ?? decimalYear(row.year, row.month, 15) }));
  const last = withDecimal[withDecimal.length - 1] ?? null;
  const lastTwelve = trimmedTail(withDecimal, 12);
  const previousTwelve = withDecimal.slice(Math.max(0, withDecimal.length - 24), Math.max(0, withDecimal.length - 12));
  return {
    key,
    def,
    dataUrl: `${GML}/${file}`,
    lastObservation: last ? `${last.year}-${pad(last.month)}` : null,
    points: rows.length,
    payload: {
      unit,
      monthly: withDecimal.map((row) => [round(row.decimal, 5), round(row.value, 2)]),
      trend: withDecimal.filter((row) => row.trend !== null).map((row) => [round(row.decimal, 5), round(row.trend, 2)]),
      stats: {
        latest: last ? { date: `${last.year}-${pad(last.month)}`, value: round(last.value, 2) } : null,
        twelveMonthMean: lastTwelve.length === 12 ? round(mean(lastTwelve.map((row) => row.value)), 1) : null,
        previousTwelveMonthMean: previousTwelve.length === 12 ? round(mean(previousTwelve.map((row) => row.value)), 1) : null,
        annualIncrease:
          lastTwelve.length === 12 && previousTwelve.length === 12
            ? round(mean(lastTwelve.map((row) => row.value)) - mean(previousTwelve.map((row) => row.value)), 1)
            : null,
        firstYear: rows.length ? rows[0].year : null,
      },
    },
  };
}

async function loadSeaIce() {
  const base = "https://noaadata.apps.nsidc.org/NOAA/G02135/north";
  const [dailyText, climatologyText] = await Promise.all([
    fetchText(`${base}/daily/data/N_seaice_extent_daily_v4.0.csv`, { timeoutMs: 30000 }),
    fetchText(`${base}/daily/data/N_seaice_extent_climatology_1981-2010_v4.0.csv`, { timeoutMs: 30000 }),
  ]);
  const daily = parseSeaIceDaily(dailyText).map((row) => ({ ...row, key: `${row.y}-${pad(row.m)}-${pad(row.d)}` }));
  const climatology = parseSeaIceClimatology(climatologyText);
  const monthly = monthlyMeansFromDaily(daily);
  const septemberMin = extremesByYear(daily, 9, "min");
  const marchMax = extremesByYear(daily, 3, "max");
  const last = daily[daily.length - 1] ?? null;
  const latestMonthly = monthly[monthly.length - 1] ?? null;
  const climatologySeptember = mean(
    monthly.filter((row) => row.month === 9 && row.year >= 1981 && row.year <= 2010).map((row) => row.value),
  );
  const lastSeptember = septemberMin[septemberMin.length - 1] ?? null;
  const trend = linearTrend(septemberMin.map((row) => [row.year, row.value]));
  const recordSeptember = septemberMin.length
    ? septemberMin.reduce((a, b) => (b.value < a.value ? b : a))
    : null;
  const recordYearDaily = recordSeptember
    ? daily
        .filter((row) => row.y === recordSeptember.year)
        .map((row) => [dayOfYear(row.y, row.m, row.d), round(row.value, 3)])
    : [];
  const currentYearDaily = daily.filter((row) => row.y === (daily[daily.length - 1]?.y ?? 0));

  return {
    key: "seaIce",
    def: SOURCE_DEFS.seaIce,
    dataUrl: `${base}/daily/data/N_seaice_extent_daily_v4.0.csv`,
    lastObservation: last ? last.key : null,
    points: daily.length,
    payload: {
      unit: "Mio. km²",
      monthly: monthly.map((row) => [round(row.decimal, 5), round(row.value, 3)]),
      septemberMin: septemberMin.map((row) => [row.year, round(row.value, 3)]),
      marchMax: marchMax.map((row) => [row.year, round(row.value, 3)]),
      recentDaily: trimmedTail(daily, 400).map((row) => [row.key, round(row.value, 3)]),
      currentYearDaily: currentYearDaily.map((row) => [dayOfYear(row.y, row.m, row.d), round(row.value, 3)]),
      recordYearDaily: { year: recordSeptember?.year ?? null, points: recordYearDaily },
      climatology: climatology.map((row) => [row.doy, round(row.value, 3)]),
      stats: {
        latest: last
          ? {
              date: last.key,
              value: round(last.value, 3),
              percentileOfClimatology: climatologyPercentile(climatology, last),
            }
          : null,
        latestMonthly: latestMonthly
          ? { month: `${latestMonthly.year}-${pad(latestMonthly.month)}`, value: round(latestMonthly.value, 3) }
          : null,
        lastSeptember: lastSeptember
          ? {
              year: lastSeptember.year,
              value: round(lastSeptember.value, 3),
              climatology1981to2010: round(climatologySeptember, 3),
              anomalyPercent:
                climatologySeptember !== null
                  ? round(((lastSeptember.value - climatologySeptember) / climatologySeptember) * 100, 1)
                  : null,
            }
          : null,
        trendPerDecade: trend.slope !== null ? round(trend.slope * 10, 3) : null,
        recordLowSeptember: recordSeptember ? { year: recordSeptember.year, value: round(recordSeptember.value, 3) } : null,
        climatologyPeriod: REFERENCE_PERIODS.seaIceClimatology,
      },
    },
  };
}

/** Perzentil der aktuellen Tagesausdehnung innerhalb der Klimatologie 1981–2010. */
function climatologyPercentile(climatology, last) {
  const doy = dayOfYear(last.y, last.m, last.d);
  const row = climatology.find((entry) => entry.doy === doy);
  return row && row.value !== null ? round(last.value / row.value, 3) : null;
}

function dayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.round((current - start) / 86400000) + 1;
}

async function loadSeaLevel() {
  // Aktuelle Release-Version aus der Projektseite ermitteln, sonst bekannte Version verwenden.
  let releaseUrl = null;
  try {
    const html = await fetchText("https://sealevel.colorado.edu/", { timeoutMs: 12000 });
    releaseUrl = findSeaLevelRelease(html)?.url ?? null;
  } catch {
    releaseUrl = null;
  }
  const candidates = [releaseUrl, "https://sealevel.colorado.edu/files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt"].filter(
    Boolean,
  );

  let series = [];
  let usedUrl = null;
  let lastError = null;
  for (const url of candidates) {
    try {
      const text = await fetchText(url, { timeoutMs: 20000 });
      const parsed = parseSeaLevelText(text);
      if (parsed.length > 100) {
        series = parsed;
        usedUrl = url;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (!usedUrl) throw lastError ?? new Error("Keine Meeresspiegel-Zeitreihe verfügbar");

  const last = series[series.length - 1];
  const since1993 = series.filter((row) => row.decimal >= 1993);
  const lastTen = series.filter((row) => row.decimal >= last.decimal - 10);
  const trendAll = linearTrend(since1993.map((row) => [row.decimal, row.value]));
  const trendTen = linearTrend(lastTen.map((row) => [row.decimal, row.value]));

  return {
    key: "seaLevel",
    def: SOURCE_DEFS.seaLevel,
    dataUrl: usedUrl,
    lastObservation: last ? decimalToIso(last.decimal) : null,
    points: series.length,
    payload: {
      unit: "mm",
      reference: "Anstieg gegenüber dem Mittel 1992–1993, saisonale Schwankungen und GIA entfernt",
      series: series.map((row) => [round(row.decimal, 5), round(row.value, 2)]),
      stats: {
        latest: last
          ? { date: decimalToIso(last.decimal), value: round(last.value, 1), decimal: round(last.decimal, 4) }
          : null,
        rateSince1993: trendAll.slope !== null ? round(trendAll.slope, 2) : null,
        rateLastTenYears: trendTen.slope !== null ? round(trendTen.slope, 2) : null,
        startOfSeries: series.length ? decimalToIso(series[0].decimal) : null,
      },
    },
  };
}

/** Dezimaljahr zu ISO-Datum (Monat gerundet). */
function decimalToIso(decimal) {
  const year = Math.floor(decimal);
  const fraction = decimal - year;
  const daysInYear = isLeap(year) ? 366 : 365;
  const date = new Date(Date.UTC(year, 0, 1) + Math.round(fraction * daysInYear) * 86400000);
  return date.toISOString().slice(0, 10);
}

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

const LOADERS = [
  { name: "co2", load: loadCo2 },
  { name: "co2Global", load: loadCo2Global },
  { name: "temperature", load: loadTemperature },
  { name: "methane", load: () => loadGas("methane", SOURCE_DEFS.methane, "ch4/ch4_mm_gl.csv", "ppb") },
  { name: "nitrousOxide", load: () => loadGas("nitrousOxide", SOURCE_DEFS.nitrousOxide, "n2o/n2o_mm_gl.csv", "ppb") },
  { name: "seaIce", load: loadSeaIce },
  { name: "seaLevel", load: loadSeaLevel },
];

/** Lädt alle Indikatoren parallel und protokolliert Erfolg/Fehler je Quelle. */
export async function collectIndicators() {
  const results = await Promise.all(
    LOADERS.map(async ({ name, load }) => {
      try {
        return { name, ok: true, result: await load() };
      } catch (error) {
        return {
          name,
          ok: false,
          error: {
            message: String(error?.message ?? error),
            url: error?.url ?? null,
          },
        };
      }
    }),
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    references: REFERENCE_PERIODS,
    sources: [],
  };

  for (const entry of results) {
    if (entry.ok) {
      payload[entry.name] = entry.result.payload;
      payload.sources.push({
        key: entry.name,
        ...entry.result.def,
        dataUrl: entry.result.dataUrl,
        status: "ok",
        lastObservation: entry.result.lastObservation,
        points: entry.result.points,
      });
    } else {
      const def = SOURCE_DEFS[entry.name] ?? { id: entry.name, label: entry.name, provider: "unbekannt" };
      payload.sources.push({ key: entry.name, ...def, status: "error", error: entry.error });
    }
  }
  return payload;
}

/** Momentaufnahme des globalen Temperaturtrends für Headline-Kennzahlen. */
export function summarizeTemperature(temperature) {
  if (!temperature?.stats) return null;
  const { lastTwelveMonths, lastFullYear } = temperature.stats;
  return {
    baseline: temperature.baseline,
    twelveMonths: lastTwelveMonths?.value ?? null,
    twelveMonthsVsPreindustrial:
      lastTwelveMonths?.value != null ? round(lastTwelveMonths.value + GISTEMP_PREINDUSTRIAL_OFFSET_C, 2) : null,
    lastFullYear: lastFullYear?.value ?? null,
    lastFullYearVsPreindustrial:
      lastFullYear?.value != null ? round(lastFullYear.value + GISTEMP_PREINDUSTRIAL_OFFSET_C, 2) : null,
  };
}
