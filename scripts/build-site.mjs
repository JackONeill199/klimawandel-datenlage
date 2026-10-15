/**
 * Baut die statische Fassung der Seite für GitHub Pages nach `dist-site/`:
 *
 *   1. Kopie von `public/` (HTML, CSS, Diagramm- und Inhaltsskripte)
 *   2. `assets/local-client.js` – die Ortsauswertung als Browser-Bündel
 *   3. `data/indicators.json`  – Momentaufnahme der globalen Messreihen
 *
 * Beide erzeugten Teile stehen bewusst nicht im Repository: sie sind Ausgabe,
 * nicht Quelle. Der Worker liest beim Entwickeln weiterhin direkt aus `public/`.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as esbuild from "esbuild";
import { writeSnapshot } from "./snapshot.mjs";

const outDir = resolve(process.argv[2] ?? "dist-site");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(resolve("public"), outDir, { recursive: true });

const bundle = await esbuild.build({
  entryPoints: [resolve("src/browser.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: resolve(outDir, "assets/local-client.js"),
  legalComments: "none",
  metafile: true,
});
const bundleBytes = Object.values(bundle.metafile.outputs)[0]?.bytes ?? 0;
console.log(`Browser-Bündel: ${(bundleBytes / 1024).toFixed(1)} kB -> assets/local-client.js`);

const snapshot = await writeSnapshot(resolve(outDir, "data/indicators.json"));

// GitHub Pages soll die Dateien unverändert ausliefern (kein Jekyll-Lauf).
await writeFile(resolve(outDir, ".nojekyll"), "", "utf8");

console.log(`Fertig: ${outDir} (${snapshot.available}/${snapshot.total} Quellen in der Momentaufnahme)`);
if (snapshot.available === 0) {
  console.error("Abbruch: keine einzige Quelle verfügbar – diese Fassung wäre leer.");
  process.exitCode = 1;
}
