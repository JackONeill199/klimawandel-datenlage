import assert from "node:assert/strict";
import test from "node:test";

import {
  findSeaLevelRelease,
  num,
  parseCo2Annual,
  parseCo2Monthly,
  parseCo2Weekly,
  parseGasMonthly,
  parseGistemp,
  parseSeaIceClimatology,
  parseSeaIceDaily,
  parseSeaLevelText,
} from "../src/lib/parse.js";

test("num erkennt Sentinel-Werte als fehlend", () => {
  assert.equal(num("315.71"), 315.71);
  assert.equal(num("-9.99"), null);
  assert.equal(num("-999.99"), null);
  assert.equal(num("***"), null);
  assert.equal(num(""), null);
  assert.equal(num(" 425.68 "), 425.68);
});

test("parseCo2Monthly überspringt Kommentarzeilen und markiert Lücken", () => {
  const csv = [
    "# ----------------------------------------",
    '"------------------------------------------------"',
    "year,month,decimal date,average,deseasonalized,ndays,sdev,unc",
    "1958,3,1958.2027,315.71,314.44,-1,-9.99,-0.99",
    "1958,4,1958.2877,317.45,315.16,3,0.10,0.05",
    "1958,5,1958.3699,317.51,-9.99,5,0.11,0.06",
  ].join("\n");
  const rows = parseCo2Monthly(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { year: 1958, month: 3, decimal: 1958.2027, value: 315.71, seasonalAdjusted: 314.44, days: -1 });
  assert.equal(rows[2].seasonalAdjusted, null);
  assert.equal(rows[2].value, 317.51);
});

test("parseCo2Weekly liest Vorjahres- und 1800er-Vergleich", () => {
  const csv = [
    "# comment",
    "year,month,day,decimal,average,ndays,1 year ago,10 years ago,increase since 1800",
    "2026,9,27,2026.7384,425.68,4,-999.99,400.96,149.32",
    "2026,10,4,2026.7575,426.26,5,424.69,401.15,149.84",
  ].join("\n");
  const rows = parseCo2Weekly(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].yearAgo, null);
  assert.equal(rows[1].yearAgo, 424.69);
  assert.equal(rows[1].since1800, 149.84);
});

test("parseCo2Annual liest Jahresmittel und Wachstumsraten", () => {
  const mean = parseCo2Annual("year,mean,unc\n1959,315.98,0.12\n1960,316.91,0.12\n");
  assert.deepEqual(mean[1], { year: 1960, value: 316.91, uncertainty: 0.12 });
  const growth = parseCo2Annual("year,ann inc,unc\n1959,0.94,0.11\n1960,0.50,0.11\n");
  assert.equal(growth[0].value, 0.94);
});

test("parseGasMonthly verarbeitet Kommentarblöcke und Kopfzeile", () => {
  const csv = [
    "# --------------------------------------------------------------------",
    "# USE OF NOAA GML DATA",
    "#",
    "year,month,decimal,average,average_unc,trend,trend_unc",
    "1983,7,1983.542,1625.96,2.25,1635.11,1.50",
    "1983,8,1983.625,1628.04,2.83,1635.61,1.44",
  ].join("\n");
  const rows = parseGasMonthly(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].value, 1625.96);
  assert.equal(rows[1].trend, 1635.61);
});

test("parseGistemp behandelt *** und liest Spalte J-D als Jahresmittel", () => {
  const csv = [
    "Land-Ocean: Global Means",
    "Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON",
    "1880,-.19,-.25,-.09,-.16,-.10,-.21,-.19,-.10,-.15,-.23,-.22,-.18,-.17,***,***,-.12,-.17,-.20",
    "2026,1.08,1.23,1.30,1.16,1.13,1.17,1.24,1.42,1.38,***,***,***,***,***,1.12,1.20,1.28,***",
  ].join("\n");
  const { monthly, annual } = parseGistemp(csv);
  assert.equal(monthly.length, 12 + 9);
  assert.equal(annual.length, 1);
  assert.equal(annual[0].year, 1880);
  assert.equal(annual[0].value, -0.17);
  const last2026 = monthly.filter((row) => row.year === 2026);
  assert.equal(last2026.length, 9);
  assert.equal(last2026[last2026.length - 1].month, 9);
  assert.equal(last2026[last2026.length - 1].value, 1.38);
});

test("parseSeaIceDaily ignoriert die Quellenliste mit Kommata", () => {
  const csv = [
    "Year, Month, Day,     Extent,    Missing, Source Data",
    "YYYY,    MM,  DD, 10^6 sq km, 10^6 sq km, Source data product web sites",
    "1978,    10,  26,     10.231,      0.000, ['/ecs/DP1/PM/NSIDC-0051.001/1978.10.26/nt_19781026_n07_v1.1_n.bin']",
    '2026,    10,  14,      6.538,      0.000,"[\'/disks/sidads_ftp/NSIDC-0803_SEAICE_AMSR2_N_20261012_v2.0.nc\', \'/disks/sidads_ftp/NSIDC-0803_SEAICE_AMSR2_N_20261013_v2.0.nc\']"',
  ].join("\n");
  const rows = parseSeaIceDaily(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { y: 2026, m: 10, d: 14, value: 6.538 });
});

test("parseSeaIceClimatology überspringt die Kopfzeile mit Stichjahr-Zeile", () => {
  const csv = [
    "Std Years = 1981-2010",
    "DOY,   Average Extent,   Std Deviation,      10th,      25th,      50th,      75th,      90th",
    "001,           13.778,           0.407,    13.183,    13.479,    13.823,    14.095,    14.257",
    "258,            4.903,           0.500,     4.200,     4.500,     4.900,     5.200,     5.500",
  ].join("\n");
  const rows = parseSeaIceClimatology(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { doy: 1, value: 13.778 });
  assert.deepEqual(rows[1], { doy: 258, value: 4.903 });
});

test("parseSeaLevelText liest Dezimaljahr und Millimeterwert", () => {
  const txt = [
    "# Date      2026_rel2 w/ seasonal signals and GIA removed (mm)",
    "1992.9594981674402      -16.737",
    "2026.4856367704842      98.849",
  ].join("\n");
  const rows = parseSeaLevelText(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].value, 98.849);
  assert.equal(rows[0].decimal, 1992.9594981674402);
});

test("findSeaLevelRelease erkennt die aktuelle Release-URL", () => {
  const html = `<a href="files/2025_rel3/gmsl_2025rel3_seasons_rmvd.pdf">pdf</a>
    <a href="files/2026_rel2/gmsl_2026rel2_seasons_rmvd.pdf">pdf</a>
    <a href="files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt">txt</a>`;
  const release = findSeaLevelRelease(html);
  assert.equal(release.release, "2026_rel2");
  assert.equal(release.url, "https://sealevel.colorado.edu/files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt");
});

test("findSeaLevelRelease gibt null zurück, wenn keine Release verlinkt ist", () => {
  assert.equal(findSeaLevelRelease("<html>keine Daten</html>"), null);
});
