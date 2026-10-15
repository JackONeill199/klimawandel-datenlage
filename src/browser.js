/**
 * Einstiegspunkt für die Ausführung im Browser.
 *
 * Auf GitHub Pages gibt es keinen Worker. Die Ortsabfragen laufen dort direkt
 * über die Schnittstellen von Open-Meteo, die CORS für beliebige Herkünfte
 * freigeben. Es wird derselbe Code benutzt wie im Worker – nur eben im Browser
 * gebündelt.
 */
export { loadLocalClimate, loadLocalCurrent, loadLocalProjection, searchPlaces } from "./lib/local.js";
export { LOCAL_SOURCE_DEFS, PROJECTION_MODELS, LOCAL_REFERENCE_PERIODS } from "./lib/local.js";
