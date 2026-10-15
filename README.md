# Klimawandel · Datenlage

Interaktive Informationsseite über den anthropogenen Klimawandel. Alle Zeitreihen
stammen aus öffentlichen Messnetzen und werden aus den Originaldateien der
Betreiber ausgewertet – es gibt keine kopierten Kennzahlen in der Oberfläche.

Die Seite läuft in zwei Betriebsarten aus derselben Codebasis:

- **Mit Worker** (Cloudflare, `wrangler dev` oder `wrangler deploy`): alle Daten
  werden serverseitig geholt, geparst und im Edge-Cache gehalten.
- **Statisch auf GitHub Pages**: der Build holt die globalen Reihen einmal und legt
  sie als Momentaufnahme neben die Seite; die Ortsauswertung läuft gebündelt im
  Browser gegen Open-Meteo. Warum das nötig ist: ein Teil der Messnetze gibt CORS
  nicht frei, und GitHub Pages führt keinen Code aus.

## Inhalt

| Abschnitt | Datenquelle | Takt |
| --- | --- | --- |
| CO₂-Konzentration (Mauna Loa, wöchentlich/monatlich/Jahresmittel/Wachstumsrate) | NOAA Global Monitoring Laboratory | wöchentlich bis monatlich |
| Globale CO₂-Konzentration (geglättet) | NOAA GML | monatlich |
| Globale Temperaturanomalie (GISTEMP v4) | NASA Goddard Institute for Space Studies | monatlich |
| Methan und Lachgas, globales Mittel | NOAA GML | monatlich |
| Arktische Meereisausdehnung (Sea Ice Index v4.0) | NSIDC (NOAA-gefördert) | täglich |
| Globaler Meeresspiegel aus Satellitenaltimetrie | Sea Level Research Group, University of Colorado | etwa 10-tägig, neue Release-Versionen |
| Ortswetter, Luftqualität | Open-Meteo (nationale Wetterdienste, CAMS) | stündlich |
| Ortserwärmung (ERA5-Reanalyse, 1950 bis gestern) | Open-Meteo Historical Weather API | täglich, etwa 5 Tage Verzug |
| Projektion bis 2050 | Open-Meteo Climate API (HighResMIP/CMIP6, 3 Modelle) | statische Modellläufe |

Redaktionelle Zahlen (IPCC AR6, WMO, Global Carbon Budget, IEA, IRENA, Ember) sind
in `public/assets/content.js` mit Quelle, Bezugszeitraum und Stand hinterlegt.

## Architektur

```
public/                 statische Seite (HTML, CSS, JS, eigene SVG-Diagramme)
src/worker.js           Worker: API-Routen und Auslieferung der Assets
src/browser.js          Einstiegspunkt des Browser-Bündels (Pages-Betrieb)
src/lib/http.js         Abruf mit Timeout, Wiederholung und Edge-Cache
src/lib/parse.js        Parser der Rohformate (NOAA, NASA, NSIDC, CU)
src/lib/stats.js        Trend, Mittel, Aggregation (rein, ohne Abhängigkeiten)
src/lib/sources.js      globale Indikatoren zusammenführen
src/lib/local.js        Ortsauswertung (Open-Meteo)
scripts/                Snapshot, Site-Build und Prüfserver für Pages
test/                   Unit-Tests mit dem Node-Testrunner
.github/workflows/      Build und Veröffentlichung der statischen Fassung
```

Kein Framework, keine Laufzeitabhängigkeit: die Diagramme sind ein eigenes
SVG-Modul (`public/assets/charts.js`) mit Hover-Ablesung, Legende zum
Umschalten und wählbaren Zeiträumen. Die Seite lädt kein Skript eines Dritten.
Im Worker-Betrieb erlaubt die Content-Security-Policy ausschließlich eigene
Quellen (`connect-src 'self'`); im Pages-Betrieb fragt der Browser für die
Ortsauswertung ausschließlich Open-Meteo direkt – mit den Koordinaten, nach denen
gesucht wurde, und nichts darüber hinaus.

### API

| Route | Inhalt | Cache |
| --- | --- | --- |
| `GET /api/indicators` | alle globalen Indikatoren inklusive Quellenprotokoll | 6 h |
| `GET /api/local/current?lat&lon` | aktuelle Bedingungen, Vorhersage, Luftqualität | 15 min |
| `GET /api/local/climate?lat&lon` | Ortserwärmung seit 1950, Erwärmungsstreifen, Extremtage | 7 Tage |
| `GET /api/local/projection?lat&lon` | Modellprojektion bis 2050, bei Bedarf geladen | 7 Tage (300 s bei Fehlschlag) |
| `GET /api/geocode?q` | Ortssuche | 30 Tage |
| `GET /api/health` | Statusmeldung | keine |

Fehlende Einzelwerte (Sentinel-Werte wie `-9.99` oder `***` in den Originaldateien)
werden als Lücke behandelt und nicht als Null interpretiert. Fällt eine Quelle
aus, liefert die Seite die übrigen Indikatoren weiter und weist den Fehler in der
Quellentabelle aus.

## Entwicklung

```bash
npm install
npm run dev        # wrangler dev, Standardport 8787
npm test           # Unit-Tests für Parser und Statistik
npm run build      # gebündelter Worker nach dist/worker.js
npm run snapshot   # Momentaufnahme der globalen Reihen nach public/data/
npm run build:site # statische Fassung für Pages nach dist-site/
npm run serve:site -- 8803   # statische Fassung lokal prüfen
```

Hinweise zum lokalen Betrieb:

- Der Port lässt sich mit `npm run dev -- --port 8802 --persist-to .scratch/state`
  ändern; ein eigener Zustandsordner vermeidet Konflikte mit anderen
  laufenden Entwicklungsinstanzen.
- `cf: { cacheTtl }` sollte bei Abrufen zu Open-Meteo nicht verwendet werden:
  die Anfragen laufen dann über Cloudflares Netz und teilen sich ein
  ratenbegrenztes Kontingent, was zu HTTP 429 führt.
- Open-Meteo begrenzt Anfragen pro Minute und Stunde, wobei lange Modellläufe
  stark gewichtet werden. Die Projektion liegt deshalb in einer eigenen Route,
  wird erst geladen, wenn ihre Karte sichtbar wird (oder auf Klick), mit zwei
  Wiederholungen und Wartezeiten von 6 und 12 Sekunden abgerufen und bei
  Fehlschlag nur 5 Minuten zwischengespeichert. Schlägt sie fehl, bleiben die
  übrigen Ortsauswertungen nutzbar, und die Karte bietet einen neuen Versuch an.

## Veröffentlichung auf GitHub Pages

Die Seite ist unter <https://jackoneill199.github.io/klimawandel-datenlage/>
veröffentlicht (ein Projekt-Pages, deshalb liegen alle Pfade relativ).

`.github/workflows/pages.yml` läuft bei jedem Push auf `main`, einmal täglich
(05:23 UTC) und auf Zuruf. Der Lauf testet, baut `dist-site/` und lädt das
Verzeichnis als Pages-Artefakt hoch.

Der Build setzt sich aus drei Teilen zusammen:

1. Kopie von `public/`
2. `assets/local-client.js` – die Ortsauswertung aus `src/lib/local.js` als
   Browser-Bündel (rund 17 kB), erzeugt mit esbuild
3. `data/indicators.json` – Momentaufnahme der sieben globalen Reihen (rund 160 kB),
   mit demselben Code erzeugt, den auch der Worker benutzt

Wichtig für die Einordnung der Daten:

- Die globalen Reihen sind **so frisch wie der letzte Build**, nicht so frisch wie
  der Seitenaufruf. Die Seite schreibt das in den Kopf („Momentaufnahme des letzten
  Builds“) und in die Fußzeile.
- Die Ortsauswertung ist weiterhin live: sie fragt Open-Meteo bei jedem Aufruf.
- Die Momentaufnahme steht bewusst nicht im Repository – sie ist Ausgabe, nicht
  Quelle. Bricht ein Build ab, bleibt die zuletzt erfolgreich veröffentlichte
  Fassung online, statt durch eine leere ersetzt zu werden.
- Gibt der Anbieter für die Momentaufnahme manche Quellen nicht heraus, wird die
  Fassung trotzdem veröffentlicht und die Quellentabelle kennzeichnet die Lücke.
  Nur wenn **keine** Quelle erreichbar ist, bricht der Build ab.

## Datenverarbeitung im Detail

- **Temperatur:** GISTEMP-Anomalien beziehen sich auf 1951–1980. Die
  Näherung für 1850–1900 addiert 0,19 °C (NASA/GISS-FAQ, Stand Januar 2025,
  dort als Zuschlag für den Übergang 1880–1899 → 1850–1900 begründet).
- **Meereis:** Aus den täglichen Werten werden Monatsmittel, das
  September-Minimum und das März-Maximum je Jahr berechnet. Das September-Minimum
  ist der empfindlichste Jahreswert.
- **Meeresspiegel:** Die Release-URL wird aus der Projektseite der University of
  Colorado ermittelt, mit einer fest hinterlegten Version als Rückfallebene.
  Angezeigt werden Anstiegsraten der gesamten Reihe und der letzten zehn Jahre
  aus linearer Regression.
- **Ortsauswertung:** Das laufende, unvollständige Jahr wird aus Jahresmitteln,
  Erwärmungsstreifen und Kennzahlen ausgeschlossen, weil die warmen Monate das
  Mittel sonst nach oben verzerren.
- **Extremtage:** Tage mit Tagesmaximum ≥ 30 °C und Tage mit Tagesminimum < 0 °C,
  aggregiert zu 10-Jahres-Mitteln über vollständige Jahre. Beide Reihen liegen um
  ein Vielfaches auseinander (Frosttage sind viel häufiger); sie werden deshalb in
  zwei Feldern mit je eigener, bei null beginnender Achse gezeigt statt in
  Gruppenbalken auf einer gemeinsamen Achse.
- **Projektion:** Drei Modelle (MRI_AGCM3_2_S, EC_Earth3P_HR, MPI_ESM1_2_XR) aus
  der HighResMIP-Reihe, näherungsweise hoher Emissionspfad. Die Spanne 2041–2050
  ist die Spanne der Modell-Jahrzehntmittel, nicht einzelner Jahre.

## Lizenz und Quellen

Die Seite gibt Quellen und Bezugszeiträume bei jeder Kurve an. Datenlizenzen:
NOAA/NASA-Daten sind gemeinfrei, NSIDC und CU Boulder sind mit Quellenangabe
frei nutzbar, Open-Meteo steht unter CC BY 4.0. Die Seite setzt keine Cookies,
lädt keine Drittanbieter-Skripte und betreibt kein Tracking.
