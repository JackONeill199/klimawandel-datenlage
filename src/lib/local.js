/**
 * Ortsbezogene Auswertung mit Open-Meteo (Wetter, Luftqualität, ERA5-Reanalyse,
 * CMIP6/HighResMIP-Projektionen). Alle Auswertungen sind serverseitig, damit die
 * Seite keine Drittanbieter-Skripte laden muss.
 */
import { fetchJson } from "./http.js";
import { annualMeansFromSeries, decimalYear, linearTrend, mean, round } from "./stats.js";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const CLIMATE_URL = "https://climate-api.open-meteo.com/v1/climate";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

export const LOCAL_SOURCE_DEFS = {
  forecast: {
    id: "open-meteo-forecast",
    label: "Aktuelles Wetter und Vorhersage am gewählten Ort",
    provider: "Open-Meteo (Daten: nationale Wetterdienste, ICON/DWD u. a.)",
    cadence: "stündlich",
    license: "CC BY 4.0",
    homepage: "https://open-meteo.com/",
  },
  air: {
    id: "open-meteo-air-quality",
    label: "Luftqualität (PM2,5, PM10, europäischer Luftqualitätsindex)",
    provider: "Open-Meteo Air Quality API (CAMS, Copernicus)",
    cadence: "stündlich",
    license: "CC BY 4.0",
    homepage: "https://open-meteo.com/en/docs/air-quality-api",
  },
  reanalysis: {
    id: "open-meteo-era5",
    label: "Beobachtete Ortserwärmung (ERA5-Reanalyse, Tageswerte)",
    provider: "Open-Meteo Historical Weather API auf Basis ECMWF ERA5",
    cadence: "täglich mit etwa fünf Tagen Verzug",
    license: "CC BY 4.0",
    homepage: "https://open-meteo.com/en/docs/historical-weather-api",
  },
  projection: {
    id: "open-meteo-climate",
    label: "Projektion bis 2050 (regional hochauflösende CMIP6-Modelle)",
    provider: "Open-Meteo Climate API (HighResMIP, IPCC CMIP6)",
    cadence: "statische Modellläufe, keine laufende Aktualisierung",
    license: "CC BY 4.0",
    homepage: "https://open-meteo.com/en/docs/climate-api",
  },
};

/** Projektionsmodelle: hohe Emissionspfad-Näherung, daher als Obergrenze zu lesen. */
export const PROJECTION_MODELS = ["MRI_AGCM3_2_S", "EC_Earth3P_HR", "MPI_ESM1_2_XR"];

export const LOCAL_REFERENCE_PERIODS = {
  baseline: { from: 1951, to: 1980, label: "1951–1980" },
  stripes: { from: 1971, to: 2000, label: "1971–2000" },
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function yesterdayIso() {
  const now = new Date();
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)));
}

/** Aktuelle Bedingungen, Vorhersage und Luftqualität. */
export async function loadLocalCurrent(lat, lon) {
  const common = `latitude=${lat}&longitude=${lon}&timezone=auto`;
  const [forecast, air] = await Promise.all([
    fetchJson(
      `${FORECAST_URL}?${common}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m` +
        `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&past_days=1&wind_speed_unit=kmh`,
      { timeoutMs: 20000 },
    ),
    fetchJson(
      `${AIR_URL}?${common}&current=pm2_5,pm10,european_aqi&hourly=pm2_5&past_days=1&forecast_days=1`,
      { timeoutMs: 20000 },
    ).catch(() => null),
  ]);

  const hourlyTimes = forecast.hourly?.time ?? [];
  const hourlyValues = forecast.hourly?.temperature_2m ?? [];

  return {
    generatedAt: new Date().toISOString(),
    location: {
      latitude: forecast.latitude,
      longitude: forecast.longitude,
      elevation: forecast.elevation,
      timezone: forecast.timezone,
    },
    current: forecast.current
      ? {
          time: forecast.current.time,
          temperature: forecast.current.temperature_2m,
          apparent: forecast.current.apparent_temperature,
          humidity: forecast.current.relative_humidity_2m,
          precipitation: forecast.current.precipitation,
          windSpeed: forecast.current.wind_speed_10m,
          units: forecast.current_units,
        }
      : null,
    daily: (forecast.daily?.time ?? []).map((date, index) => ({
      date,
      max: forecast.daily.temperature_2m_max?.[index] ?? null,
      min: forecast.daily.temperature_2m_min?.[index] ?? null,
      precipitation: forecast.daily.precipitation_sum?.[index] ?? null,
    })),
    series: hourlyTimes.map((time, index) => [time, hourlyValues[index] ?? null]).filter(([, value]) => value !== null),
    air: air
      ? {
          time: air.current?.time ?? null,
          pm25: air.current?.pm2_5 ?? null,
          pm10: air.current?.pm10 ?? null,
          europeanAqi: air.current?.european_aqi ?? null,
          pm25Series: (air.hourly?.time ?? []).map((time, index) => [time, air.hourly.pm2_5?.[index] ?? null]),
        }
      : null,
    sources: [LOCAL_SOURCE_DEFS.forecast, ...(air ? [LOCAL_SOURCE_DEFS.air] : [])],
  };
}

/** Beobachtete Ortserwärmung, Kennzahlen extremer Tage und Projektion bis 2050. */
export async function loadLocalClimate(lat, lon) {
  const endDate = yesterdayIso();
  const archive = await fetchJson(
    `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=1950-01-01&end_date=${endDate}` +
      `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=auto`,
    { timeoutMs: 45000 },
  );

  const times = archive.daily?.time ?? [];
  const dailyMean = archive.daily?.temperature_2m_mean ?? [];
  const dailyMax = archive.daily?.temperature_2m_max ?? [];
  const dailyMin = archive.daily?.temperature_2m_min ?? [];

  const monthly = [];
  for (let index = 0; index < times.length; index += 1) {
    const value = dailyMean[index];
    if (value === null || value === undefined) continue;
    const [year, month] = times[index].split("-").map(Number);
    monthly.push({ key: times[index].slice(0, 7), year, month, value });
  }
  const annual = annualMeansFromSeries(monthly);

  // Kennzahlen extremer Tage je Jahr
  const extremesByYearMap = new Map();
  for (let index = 0; index < times.length; index += 1) {
    const year = Number(times[index].slice(0, 4));
    const max = dailyMax[index];
    const min = dailyMin[index];
    const entry = extremesByYearMap.get(year) ?? { year, hotDays: 0, summerDays: 0, frostDays: 0, days: 0 };
    if (typeof max === "number") {
      entry.days += 1;
      if (max >= 30) entry.hotDays += 1;
      if (max >= 25) entry.summerDays += 1;
    }
    if (typeof min === "number" && min < 0) entry.frostDays += 1;
    extremesByYearMap.set(year, entry);
  }
  const currentYear = new Date().getUTCFullYear();
  const extremeYears = [...extremesByYearMap.values()]
    .filter((entry) => entry.year < currentYear && entry.days >= 350)
    .sort((a, b) => a.year - b.year);

  // Das laufende Jahr ist unvollständig und würde das Mittel der warmen Monate verzerren:
  // es wird aus Reihen und Kennzahlen ausgeschlossen.
  const completeYears = annual.filter((row) => row.year < currentYear);
  const lastCompleteYear = completeYears[completeYears.length - 1] ?? null;

  const baselinePeriod = LOCAL_REFERENCE_PERIODS.baseline;
  const stripesPeriod = LOCAL_REFERENCE_PERIODS.stripes;
  const baseline = mean(completeYears.filter((row) => row.year >= baselinePeriod.from && row.year <= baselinePeriod.to).map((row) => row.value));
  const stripesReference = mean(completeYears.filter((row) => row.year >= stripesPeriod.from && row.year <= stripesPeriod.to).map((row) => row.value));

  const observedTrend = linearTrend(completeYears.map((row) => [row.year, row.value]));
  const lastDecade = completeYears.slice(-10);
  const firstDecade = completeYears.filter((row) => row.year >= 1950 && row.year <= 1959);
  const warmest = [...completeYears].sort((a, b) => b.value - a.value)[0] ?? null;
  const coldest = [...completeYears].sort((a, b) => a.value - b.value)[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    location: {
      latitude: archive.latitude,
      longitude: archive.longitude,
      elevation: archive.elevation,
      timezone: archive.timezone,
    },
    observed: {
      unit: "°C",
      coverage: times.length ? `${times[0].slice(0, 4)}–${times[times.length - 1].slice(0, 10)}` : null,
      annual: completeYears.map((row) => [row.year, round(row.value, 2)]),
      baseline: { period: baselinePeriod.label, value: round(baseline, 2) },
      stripesReference: { period: stripesPeriod.label, value: round(stripesReference, 2) },
      stripes: completeYears.map((row) => [row.year, round(row.value - stripesReference, 2)]),
      stats: {
        partialYearExcluded: currentYear,
        lastCompleteYear: lastCompleteYear
          ? {
              year: lastCompleteYear.year,
              value: round(lastCompleteYear.value, 2),
              anomalyToBaseline: round(lastCompleteYear.value - baseline, 2),
            }
          : null,
        lastDecade: lastDecade.length ? `${lastDecade[0].year}–${lastDecade[lastDecade.length - 1].year}` : null,
        lastDecadeMean: round(mean(lastDecade.map((row) => row.value)), 2),
        lastDecadeAnomaly: round(mean(lastDecade.map((row) => row.value)) - baseline, 2),
        firstDecadeMean: round(mean(firstDecade.map((row) => row.value)), 2),
        firstDecade: firstDecade.length ? `${firstDecade[0].year}–${firstDecade[firstDecade.length - 1].year}` : null,
        trendPerDecade: observedTrend.slope !== null ? round(observedTrend.slope * 10, 2) : null,
        trendSignificance: observedTrend.r2 !== null ? round(observedTrend.r2, 2) : null,
        warmest: warmest ? { year: warmest.year, value: round(warmest.value, 2) } : null,
        coldest: coldest ? { year: coldest.year, value: round(coldest.value, 2) } : null,
        years: annual.length,
      },
    },
    extremeDays: extremeYears.map((entry) => [
      entry.year,
      entry.hotDays,
      entry.summerDays,
      entry.frostDays,
    ]),
    sources: [LOCAL_SOURCE_DEFS.reanalysis],
  };
}

/**
 * Projektion bis 2050, separat abrufbar. Modellläufe über dreißig Jahre sind beim
 * Anbieter schwer gewichtet; sie werden deshalb nicht bei jedem Seitenaufruf,
 * sondern erst bei Bedarf geladen (und dann sieben Tage gehalten).
 */
export async function loadLocalProjection(lat, lon) {
  try {
    return await loadProjection(lat, lon);
  } catch (error) {
    return {
      error: String(error?.message ?? error),
      sources: [LOCAL_SOURCE_DEFS.projection],
    };
  }
}

/** Projektion der Jahresmitteltemperatur je Modell bis 2050. */
async function loadProjection(lat, lon) {
  const startYear = 2020;
  const endYear = 2050;
  const response = await fetchJson(
    `${CLIMATE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
      `&models=${PROJECTION_MODELS.join(",")}&daily=temperature_2m_mean&timezone=auto`,
    // Der Anbieter begrenzt Anfragen pro Minute; die Wartezeiten werden deshalb so gewählt,
    // dass ein neuer Versuch in der Regel in der nächsten Minute liegt.
    { timeoutMs: 60000, retries: 2, retryDelayMs: 6000 },
  );

  const times = response.daily?.time ?? [];
  const keys = Object.keys(response.daily ?? {}).filter((key) => key !== "time");
  const modelSeries = [];

  for (const key of keys) {
    const values = response.daily[key] ?? [];
    const monthly = [];
    for (let index = 0; index < times.length; index += 1) {
      const value = values[index];
      if (value === null || value === undefined) continue;
      const [year, month] = times[index].split("-").map(Number);
      monthly.push({ key: times[index].slice(0, 7), year, month, value });
    }
    const annual = annualMeansFromSeries(monthly);
    modelSeries.push({
      model: key.replace(/^temperature_2m_mean_?/, "") || "Modell",
      annual,
    });
  }

  const ensembleYears = new Map();
  for (const { annual } of modelSeries) {
    for (const row of annual) {
      const bucket = ensembleYears.get(row.year) ?? [];
      bucket.push(row.value);
      ensembleYears.set(row.year, bucket);
    }
  }
  const ensemble = [...ensembleYears.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, values]) => [year, round(mean(values), 2), round(Math.min(...values), 2), round(Math.max(...values), 2)]);

  const lastDecade = ensemble.filter(([year]) => year >= 2041);
  const firstYears = ensemble.filter(([year]) => year <= 2025);

  // Spanne zwischen den Modellen für das Jahrzehntmittel 2041–2050 (nicht Spanne einzelner Jahre).
  const modelDecadeMeans = modelSeries
    .map((entry) => mean(entry.annual.filter((row) => row.year >= 2041 && row.year <= 2050).map((row) => row.value)))
    .filter((value) => value !== null);

  return {
    unit: "°C",
    horizon: `${startYear}–${endYear}`,
    models: modelSeries.map((entry) => entry.model),
    modelSeries: modelSeries.map((entry) => ({ model: entry.model, annual: entry.annual.map((row) => [row.year, round(row.value, 2)]) })),
    ensemble,
    stats: {
      mean2041to2050: round(mean(lastDecade.map((row) => row[1])), 2),
      mean2020to2025: round(mean(firstYears.map((row) => row[1])), 2),
      spread2041to2050:
        modelDecadeMeans.length > 1 ? [round(Math.min(...modelDecadeMeans), 2), round(Math.max(...modelDecadeMeans), 2)] : null,
    },
    note:
      "Die Modelle der HighResMIP-Reihe folgen näherungsweise einem sehr hohen Emissionspfad (RCP8.5-ähnlich). " +
      "Die Kurve ist daher als obere Abschätzung zu lesen, nicht als Prognose. Unterschiede zwischen den Emissionspfaden " +
      "werden vor 2050 nur teilweise sichtbar.",
  };
}

/** Ortssuche über die Open-Meteo-Geocoding-Schnittstelle. */
export async function searchPlaces(query) {
  const term = String(query ?? "").trim();
  if (term.length < 2) return { results: [] };
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=de&format=json`,
    { timeoutMs: 15000 },
  );
  const results = (data.results ?? []).map((row) => ({
    name: row.name,
    country: row.country,
    admin1: row.admin1,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    population: row.population ?? null,
  }));
  return { results };
}

export { decimalYear };
