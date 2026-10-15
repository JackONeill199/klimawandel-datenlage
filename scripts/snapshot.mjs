/**
 * Erzeugt die Momentaufnahme der globalen Klimareihen als statische JSON-Datei.
 *
 * Auf GitHub Pages gibt es keinen Server, der bei jedem Aufruf die Originaldateien
 * von NOAA, NASA, NSIDC und CU Boulder holt (ein Teil davon gibt CORS nicht frei).
 * Der Build holt die Daten deshalb einmal selbst – mit demselben Code wie der
 * Worker – und legt das Ergebnis als Datei neben die Seite.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectIndicators } from "../src/lib/sources.js";

export async function writeSnapshot(target, { log = console.log } = {}) {
  const started = Date.now();
  log("Quellen werden abgerufen …");
  const payload = await collectIndicators();
  const available = (payload.sources ?? []).filter((entry) => entry.status === "ok");
  const failed = (payload.sources ?? []).filter((entry) => entry.status !== "ok");

  const json = JSON.stringify(payload);
  const file = resolve(target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, json, "utf8");

  log(
    `Momentaufnahme: ${available.length} von ${(payload.sources ?? []).length} Quellen verfügbar` +
      `, ${(json.length / 1024).toFixed(1)} kB, ${Date.now() - started} ms -> ${file}`,
  );
  for (const entry of failed) log(`  fehlend: ${entry.id ?? entry.label ?? "?"} – ${entry.error ?? "unbekannter Grund"}`);
  if (failed.length) {
    // Eine unvollständige Momentaufnahme wird veröffentlicht, aber sichtbar gemeldet:
    // die Seite kennzeichnet fehlende Quellen selbst.
    log(`  Hinweis: ${failed.length} Quelle(n) fehlen in dieser Fassung.`);
  }
  return { file, bytes: json.length, available: available.length, total: (payload.sources ?? []).length };
}

// Direkter Aufruf: node scripts/snapshot.mjs [Zieldatei]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeSnapshot(process.argv[2] ?? "public/data/indicators.json");
}
