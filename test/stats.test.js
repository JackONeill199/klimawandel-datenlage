import assert from "node:assert/strict";
import test from "node:test";

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
  runningMean,
  splitDate,
} from "../src/lib/stats.js";

test("mean ignoriert Nicht-Zahlen und liefert null ohne gültige Werte", () => {
  assert.equal(mean([1, 2, 3, null, Number.NaN]), 2);
  assert.equal(mean([]), null);
  assert.equal(mean([null, undefined]), null);
});

test("linearTrend findet eine exakte Gerade", () => {
  const trend = linearTrend([
    [2000, 10],
    [2001, 11],
    [2002, 12],
    [2003, 13],
  ]);
  assert.equal(trend.slope, 1);
  assert.equal(trend.intercept, -1990);
  assert.equal(trend.r2, 1);
  assert.equal(trend.n, 4);
});

test("linearTrend rechnet einen Meeresspiegelanstieg korrekt in mm pro Jahr", () => {
  // 5 Jahre, 3 mm pro Jahr, gedämpft durch zwei Ausreißer
  const points = [
    [2015, 0],
    [2016, 3.2],
    [2017, 5.6],
    [2018, 9.4],
    [2019, 12],
  ];
  const trend = linearTrend(points);
  assert.ok(Math.abs(trend.slope - 3.02) < 0.1, `Steigung war ${trend.slope}`);
  assert.ok(trend.r2 > 0.98);
});

test("linearTrend gibt bei zu wenigen Punkten null zurück", () => {
  assert.deepEqual(linearTrend([[2000, 1], [2001, 2]]), { slope: null, intercept: null, r2: null, n: 2 });
});

test("decimalYear/splitDate rechnen Datumsangaben in Dezimaljahre um", () => {
  assert.equal(decimalYear(2000, 1, 1), 2000);
  assert.ok(Math.abs(decimalYear(2020, 7, 2) - (2020 + 183 / 366)) < 1e-9);
  assert.deepEqual(splitDate("2026-09-27"), { year: 2026, month: 9, day: 27 });
  assert.deepEqual(splitDate("2026-09"), { year: 2026, month: 9, day: 1 });
  assert.equal(splitDate("keine"), null);
});

test("monthlyMeansFromDaily mittelt Tageswerte je Monat", () => {
  const daily = [
    { y: 2020, m: 1, d: 1, value: 2 },
    { y: 2020, m: 1, d: 2, value: 4 },
    { y: 2020, m: 2, d: 1, value: 10 },
    { y: 2020, m: 2, d: 2, value: null },
  ];
  const monthly = monthlyMeansFromDaily(daily);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].value, 3);
  assert.equal(monthly[0].n, 2);
  assert.equal(monthly[1].value, 10);
  assert.equal(monthly[1].n, 1);
  assert.equal(monthly[0].decimal > 2020 && monthly[0].decimal < 2020.1, true);
});

test("annualMeansFromSeries mittelt Monatswerte zu Jahresmitteln", () => {
  const series = [
    { key: "2019-11", year: 2019, value: 10 },
    { key: "2019-12", year: 2019, value: 12 },
    { key: "2020-01", year: 2020, value: 5 },
  ];
  const annual = annualMeansFromSeries(series);
  assert.deepEqual(annual.map((row) => [row.year, row.value, row.n]), [
    [2019, 11, 2],
    [2020, 5, 1],
  ]);
});

test("extremesByYear findet September-Minimum und März-Maximum", () => {
  const daily = [];
  for (const year of [1979, 1980]) {
    for (const [month, values] of [
      [3, [15, 16.4, 15.2]],
      [9, [7.0, 5.1, 6.2]],
    ]) {
      values.forEach((value, index) => daily.push({ y: year, m: month, d: index + 1, value }));
    }
  }
  const minima = extremesByYear(daily, 9, "min");
  assert.deepEqual(minima, [
    { year: 1979, value: 5.1 },
    { year: 1980, value: 5.1 },
  ]);
  const maxima = extremesByYear(daily, 3, "max");
  assert.equal(maxima[0].value, 16.4);
});

test("runningMean erzeugt ein gleitendes Mittel über die angegebene Fenstergröße", () => {
  const series = Array.from({ length: 6 }, (_, index) => ({ key: `2020-0${index + 1}`, year: 2020, decimal: 2020 + index / 12, value: index }));
  const smoothed = runningMean(series, 4);
  assert.equal(smoothed.length, 3);
  assert.equal(smoothed[0].value, 1.5);
  assert.equal(smoothed[2].value, 3.5);
});

test("decadalMeans und periodMean fassen Jahresreihen zusammen", () => {
  const annual = [
    { year: 1959, value: 1 },
    { year: 1960, value: 2 },
    { year: 1969, value: 4 },
    { year: 1971, value: 8 },
  ];
  const decades = decadalMeans(annual);
  assert.deepEqual(decades.map((row) => row.decade), [1950, 1960, 1970]);
  assert.equal(decades[0].value, 1);
  assert.equal(decades[2].value, 8);
  assert.equal(periodMean(annual, 1959, 1969), (1 + 2 + 4) / 3);
  assert.equal(periodMean(annual, 1980, 1990), null);
});

test("round vermeidet negative Null", () => {
  assert.equal(round(-0.001, 2), 0);
  assert.equal(round(1.239, 2), 1.24);
  assert.equal(round(Number.NaN, 2), null);
});
