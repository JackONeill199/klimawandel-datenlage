/**
 * Parser für die Rohformate der Live-Datenquellen.
 * Alle Funktionen sind rein (String rein, Datenstruktur raus) und daher testbar.
 */

/** Sentinel-Werte der Quellen für "keine Messung". */
const MISSING = new Set(["-9.99", "-9.999", "-999.99", "-999.999", "***", "*", "", "nan", "-"]);

export function num(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/^"|"$/g, "");
  if (!text) return null;
  if (MISSING.has(text.toLowerCase()) || MISSING.has(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function lines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isNumericLine(line) {
  return /^[\s(]*\d/.test(line) && !line.startsWith("#");
}

/**
 * NOAA GML: co2_mm_mlo.csv
 * year,month,decimal date,average,deseasonalized,ndays,sdev,unc
 */
export function parseCo2Monthly(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#") || !isNumericLine(line)) continue;
    const c = line.split(",");
    const year = num(c[0]);
    const month = num(c[1]);
    if (year === null || month === null) continue;
    out.push({
      year,
      month,
      decimal: num(c[2]),
      value: num(c[3]),
      seasonalAdjusted: num(c[4]),
      days: num(c[5]),
    });
  }
  return out;
}

/**
 * NOAA GML: co2_weekly_mlo.csv
 * year,month,day,decimal,average,ndays,1 year ago,10 years ago,increase since 1800
 */
export function parseCo2Weekly(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#") || !isNumericLine(line)) continue;
    const c = line.split(",");
    const year = num(c[0]);
    const month = num(c[1]);
    const day = num(c[2]);
    if (year === null || month === null || day === null) continue;
    out.push({
      year,
      month,
      day,
      decimal: num(c[3]),
      value: num(c[4]),
      days: num(c[5]),
      yearAgo: num(c[6]),
      decadeAgo: num(c[7]),
      since1800: num(c[8]),
    });
  }
  return out;
}

/** NOAA GML: co2_annmean_mlo.csv (year,mean,unc) und co2_gr_mlo.csv (year,ann inc,unc). */
export function parseCo2Annual(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#") || !isNumericLine(line)) continue;
    const c = line.split(",");
    const year = num(c[0]);
    const value = num(c[1]);
    if (year === null || value === null) continue;
    out.push({ year, value, uncertainty: num(c[2]) });
  }
  return out;
}

/** NOAA GML: co2_trend_gl.csv (year,month,day,smoothed,trend) – globales CO₂. */
export function parseCo2GlobalTrend(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#") || !isNumericLine(line)) continue;
    const c = line.split(",");
    const year = num(c[0]);
    const month = num(c[1]);
    if (year === null || month === null) continue;
    const trend = num(c[4]);
    if (trend === null) continue;
    out.push({ year, month, day: num(c[2]) ?? 1, value: num(c[3]), trend });
  }
  return out;
}

/**
 * NOAA GML: ch4_mm_gl.csv / n2o_mm_gl.csv
 * year,month,decimal,average,average_unc,trend,trend_unc
 */
export function parseGasMonthly(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#") || !isNumericLine(line)) continue;
    const c = line.split(",");
    const year = num(c[0]);
    const month = num(c[1]);
    if (year === null || month === null) continue;
    out.push({
      year,
      month,
      decimal: num(c[2]),
      value: num(c[3]),
      uncertainty: num(c[4]),
      trend: num(c[5]),
    });
  }
  return out;
}

/**
 * NASA GISTEMP: GLB.Ts+dSST.csv
 * Zeile 1 = Beschreibung, Zeile 2 = Kopf, danach Werte; Monate sind Anomalien
 * relativ zu 1951–1980, Spalte J-D ist das Jahresmittel (Index 13).
 */
export function parseGistemp(text) {
  const rows = lines(text);
  const monthly = [];
  const annual = [];
  for (const line of rows) {
    if (!/^\d{4}\s*,/.test(line)) continue;
    const c = line.split(",").map((s) => s.trim());
    const year = num(c[0]);
    if (year === null) continue;
    for (let m = 1; m <= 12; m += 1) {
      const value = num(c[m]);
      if (value === null) continue;
      monthly.push({ year, month: m, value });
    }
    const annualValue = num(c[13]);
    if (annualValue !== null) annual.push({ year, value: annualValue });
  }
  return { monthly, annual };
}

/**
 * NSIDC Sea Ice Index (Tagesdatei, v4.0):
 * Year, Month, Day, Extent, Missing, "['...']"
 * Das letzte Feld enthält Kommata, daher wird auf die ersten vier Zahlen gematcht.
 */
export function parseSeaIceDaily(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#")) continue;
    const m = /^(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(-?[\d.]+)/.exec(line);
    if (!m) continue;
    const value = num(m[4]);
    if (value === null) continue;
    out.push({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), value });
  }
  return out;
}

/** NSIDC Klimatologie 1981–2010: DOY, Average Extent, ... */
export function parseSeaIceClimatology(text) {
  const out = [];
  for (const line of lines(text)) {
    if (/^[A-Za-z]/.test(line)) continue;
    const m = /^(\d{1,3})\s*,\s*(-?[\d.]+)/.exec(line);
    if (!m) continue;
    const value = num(m[2]);
    if (value === null) continue;
    out.push({ doy: Number(m[1]), value });
  }
  return out;
}

/** CU Sea Level Research Group: "1992.9594981674402  -16.737" */
export function parseSeaLevelText(text) {
  const out = [];
  for (const line of lines(text)) {
    if (line.startsWith("#")) continue;
    const m = /^(-?[\d.]+)\s+(-?[\d.]+)/.exec(line);
    if (!m) continue;
    const decimal = num(m[1]);
    const value = num(m[2]);
    if (decimal === null || value === null) continue;
    out.push({ decimal, value });
  }
  return out;
}

/** Ermittelt die Release-URL der aktuellen CU-Meeresspiegelreihe aus der Projektseite. */
export function findSeaLevelRelease(html) {
  const matches = [...String(html).matchAll(/files\/(\d{4}_rel\d+)\/(gmsl_\w+_seasons_rmvd\.txt)/g)];
  if (!matches.length) return null;
  const [, release, file] = matches[matches.length - 1];
  return { release, url: `https://sealevel.colorado.edu/files/${release}/${file}` };
}
