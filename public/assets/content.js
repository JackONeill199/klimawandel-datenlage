/**
 * Redaktionelle Inhalte mit belegten Zahlen. Alle Werte sind mit Quelle und
 * Stand versehen; Live-Daten kommen ausschließlich aus der eigenen API.
 */

export const HERO_QUOTE = {
  text: "Es ist eindeutig, dass der menschliche Einfluss die Atmosphäre, den Ozean und das Land erwärmt hat.",
  original: "It is unequivocal that human influence has warmed the atmosphere, ocean and land.",
  source: "IPCC AR6 WGI, Zusammenfassung für politische Entscheidungsträger (SPM), Aussage A.1",
  url: "https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/",
  context:
    "Der sechste Sachstandsbericht des IPCC stützt diese Aussage auf mehrere unabhängige Belege: die beobachtete " +
    "Erwärmung von Atmosphäre, Ozean und Land, die Abkühlung der Stratosphäre, die Verschiebung der " +
    "Jahreszeiten, den Meeresspiegelanstieg und die gemessene Veränderung der Strahlungsbilanz.",
};

export const STRUCTURE_OF_EVIDENCE = [
  {
    title: "Ursache und Antrieb",
    text:
      "Die Konzentrationen von Kohlendioxid, Methan und Lachgas haben sich seit etwa 1750 nachweislich durch " +
      "menschliche Aktivitäten erhöht.",
  },
  {
    title: "Wirkung",
    text:
      "Temperatur, Meeresspiegel, Meereis, Ozeanwärme und Niederschlagsmuster verändern sich messbar und " +
      "in der erwarteten Richtung.",
  },
  {
    title: "Zuschreibung",
    text:
      "Modelle, die nur natürliche Antriebe berücksichtigen, reproduzieren die beobachtete Erwärmung nach " +
      "etwa 1950 nicht mehr. Modelle mit menschlichen Antrieben tun es.",
  },
];

export const IPCC_FIGURES = {
  radiativeForcing: {
    value: 2.72,
    range: [1.96, 3.48],
    unit: "W/m²",
    year: 2019,
    reference: 1750,
    statement:
      "Die von Menschen verursachte Strahlungsantriebskraft betrug 2019 gegenüber 1750 rund 2,72 W/m². " +
      "Sonneneinstrahlung und Vulkanismus zeigen über diesen Zeitraum keinen erklärenden Aufwärtstrend; " +
      "die Sonneneinstrahlung hat seit den 1980er-Jahren leicht abgenommen, während sich die Erwärmung beschleunigte.",
    source: "IPCC AR6 WGI, SPM A.1 (Strahlungsantrieb), Kapitel 7",
    url: "https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-7/",
  },
  observations: {
    warming2011to2020: { value: 1.09, range: [0.95, 1.2], reference: "1850–1900" },
    humanCaused: { best: 1.07, range: [0.8, 1.3], from: "1850–1900", to: "2010–2019" },
    concentrations2019: { co2: "410 ppm", ch4: "1866 ppb", n2o: "332 ppb" },
    increaseSince1750: { co2: "+47 %", ch4: "+156 %", n2o: "+23 %" },
    preindustrialCo2: "etwa 278 ppm",
    source: "IPCC AR6 WGI, SPM A.1.1 bis A.1.3, A.2.1",
    url: "https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/",
  },
};

export const WMO_YEARS = {
  y2024: { value: 1.55, uncertainty: 0.13, label: "2024", note: "wärmstes Jahr im WMO-Datensatz" },
  y2025: { value: 1.43, label: "2025", note: "zweit- oder drittwärmstes Jahr" },
  source: "WMO, State of the Global Climate 2024 und 2025",
  url: "https://wmo.int/publication-series/state-of-global-climate/state-of-global-climate-2025",
};

export const EMISSIONS = {
  gcb2025: {
    fossil: 38.1,
    landUse: 4.1,
    total: 42.2,
    growth: 1.1,
    cumulativeShare: { fossil: 66, landUse: 34 },
    cumulativePeriod: "1850–2024",
    source: "Global Carbon Budget 2025 (Friedlingstein et al., ESSD)",
    url: "https://essd.copernicus.org/articles/18/3211/2026/",
  },
  ieaEnergy: {
    energyCo2_2024: 37.8,
    unit: "Gt CO₂",
    note: "Rekordwert der energiebedingten CO₂-Emissionen",
    source: "IEA, Global Energy Review 2025",
    url: "https://www.iea.org/reports/global-energy-review-2025/co2-emissions",
  },
  energyMix: {
    fossilShareOfPrimaryEnergy: 86,
    year: 2025,
    note: "Anteil fossiler Energieträger am globalen Energieangebot (Total Energy Supply), EI/Ember-Auswertung",
    source: "Energy Institute / Ember, Statistical Review of World Energy",
    url: "https://ember-energy.org/latest-insights/energy-institute-statistical-review-of-world-energy/",
  },
  perCapita: {
    unit: "t CO₂ je Person und Jahr",
    year: 2024,
    method:
      "CO₂ aus fossilen Brennstoffen und Industrieprozessen nach Territorialprinzip; internationale Luft- und Schifffahrt " +
      "wird keinem Land zugerechnet.",
    regions: [
      { name: "Welt", value: 4.7 },
      { name: "Deutschland", value: 6.8 },
      { name: "EU-27", value: 5.4 },
      { name: "China", value: 8.7 },
      { name: "USA", value: 14.2 },
      { name: "Indien", value: 2.2 },
    ],
    source: "Our World in Data auf Basis des Global Carbon Budget 2025",
    url: "https://ourworldindata.org/grapher/co-emissions-per-capita",
  },
};

export const CARBON_BUDGET = {
  ar6: {
    reference: "Budget ab Anfang 2020, bis zur Netto-Null-Emission",
    rows: [
      { limit: 1.5, p50: 500, p67: 400 },
      { limit: 1.7, p50: 850, p67: 700 },
      { limit: 2.0, p50: 1350, p67: 1150 },
    ],
    note:
      "Der IPCC gibt für 1,5 °C ein Budget von 500 Gt CO₂ (50 % Wahrscheinlichkeit) und 400 Gt CO₂ (67 %) an, " +
      "jeweils ab Anfang 2020. Die Werte schließen nicht-CO₂-Emissionen und nach 2030 wirkende Faktoren mit ein.",
    source: "IPCC AR6 WGI, SPM D.1 (Tabelle)",
    url: "https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/",
  },
  updated: {
    remainingFor15C_50: 130,
    annualEmissions: 42,
    asOf: "Anfang 2026",
    note:
      "Aktualisierte wissenschaftliche Schätzung: Bei rund 42 Gt CO₂ pro Jahr entspricht ein Restbudget von 130 Gt " +
      "CO₂ etwas mehr als drei Jahren Emissionen auf unverändertem Niveau. Das ist keine neue IPCC-Bewertung, " +
      "sondern eine Fortschreibung mit zwischenzeitlich besser bekannten Werten.",
    source: "Forster et al., Indicators of Global Climate Change 2025 (ESSD, 2026)",
    url: "https://essd.copernicus.org/articles/18/3889/2026/",
  },
  disclaimer:
    "Beide Angaben beruhen auf unterschiedlichen Bezugszeitpunkten, Bewertungsständen und Temperaturdatensätzen und " +
    "sind daher nicht unmittelbar gleichzusetzen. Die Rechnung „Jahre auf unverändertem Niveau“ ist eine eigene " +
    "illustrative Umrechnung, kein Prognosemodell.",
};

export const MITIGATION = {
  targets: [
    {
      value: "−43 %",
      range: "34 % bis 60 %",
      label: "Treibhausgase bis 2030 gegenüber 2019 für 1,5-°C-Pfade mit begrenztem Überschwingen",
    },
    {
      value: "−34 %",
      range: "21 % bis 57 %",
      label: "Methanemissionen bis 2030 gegenüber 2019",
    },
    {
      value: "vor 2025",
      label: "Zeitpunkt, zu dem die globalen Emissionen laut den 1,5-°C-Modellpfaden ihr Maximum erreichen müssten",
    },
  ],
  costs: [
    { label: "Solar-PV, große Anlagen", value: "0,043 USD/kWh", note: "globale gewichtete Stromgestehungskosten neuer Anlagen, 2024" },
    { label: "Wind an Land", value: "0,034 USD/kWh", note: "globale gewichtete Stromgestehungskosten neuer Anlagen, 2024" },
  ],
  electricity: [
    { label: "Anteil erneuerbarer Energien an der weltweiten Stromerzeugung 2024", value: "32 %" },
    { label: "Anteil 2025", value: "33,8 %" },
    { label: "Anteil erneuerbarer Energien am globalen Zubau an Erzeugungskapazität 2024", value: "rund 92 %" },
  ],
  notes: [
    "Die Zahlen des IPCC beschreiben modellierte Pfade, keine gemessenen Ergebnisse. Sie geben an, was nötig wäre, " +
      "nicht was geschieht.",
    "Stromgestehungskosten sind keine Endkundenpreise: Netzausbau, Speicherung, Systemintegration und Steuern sind " +
      "darin nicht enthalten.",
    "Angaben zu Zubau und Anteilen stammen von unterschiedlichen Institutionen (IEA, IRENA, Ember) mit abweichenden " +
      "Erfassungsmethoden; sie sind deshalb nicht punktgenau vergleichbar.",
  ],
  sources: [
    { label: "IPCC AR6 WGIII, SPM C.1/C.3", url: "https://www.ipcc.ch/report/ar6/wg3/chapter/summary-for-policymakers/" },
    { label: "IRENA, Renewable Power Generation Costs in 2024", url: "https://www.irena.org/Digital-Report/Renewable-Power-Generation-Costs-in-2024" },
    { label: "IEA, Renewables 2025", url: "https://www.iea.org/reports/renewables-2025/renewable-electricity" },
    { label: "Ember, Global Electricity Review 2026", url: "https://ember-energy.org/latest-insights/global-electricity-review-2026/" },
  ],
};

export const LIMITATIONS = [
  {
    title: "Kein einzelner Messpunkt ist ein Beweis",
    text:
      "Einzelne Jahre schwanken durch El Niño, Vulkanausbrüche und kurzfristige Effekte. Belastbare Aussagen stammen " +
      "aus mehrjährigen Mitteln, aus mehreren unabhängigen Datensätzen und aus der Übereinstimmung von Beobachtung " +
      "und Physik. Diese Seite zeigt deshalb durchgehend Zeitreihen statt Einzelwerte.",
  },
  {
    title: "Verschiedene Bezugszeiträume",
    text:
      "NASA GISTEMP rechnet Anomalien relativ zu 1951–1980. Die Umrechnung auf 1850–1900 ist eine Näherung " +
      "(NASA/GISS empfiehlt einen Zuschlag von etwa 0,19 °C, Stand Januar 2025) und weniger belastbar als die " +
      "Anomalie gegenüber einem modernen Bezugszeitraum.",
  },
  {
    title: "Eine Station, ein Planet",
    text:
      "Mauna Loa ist ein einzelner, hoch gelegener Messpunkt im Pazifik. Die Station ist für Hintergrundluft sehr " +
      "gut geeignet, weil sie weit von großen Quellen entfernt liegt; für den Planeten insgesamt gilt sie als guter " +
      "Indikator, ersetzt aber kein globales Messnetz.",
  },
  {
    title: "Reanalyse ist kein Stationsmesswert",
    text:
      "Die Ortsauswertung nutzt ERA5: ein Modell, das Beobachtungen einbindet. Werte für einzelne Orte sind dadurch " +
      "geglättet und für Regionen mit wenigen Wetterstationen unsicherer.",
  },
  {
    title: "Projektionen sind Spannen, keine Vorhersagen",
    text:
      "Die 2050-Kurven stammen aus drei regional hochauflösenden CMIP6-Modellen, die näherungsweise einem sehr hohen " +
      "Emissionspfad folgen. Der tatsächliche Verlauf hängt von Entscheidungen ab, die noch nicht gefallen sind.",
  },
];

export const EXTERNAL_SOURCES = [
  { label: "IPCC AR6 WGI, The Physical Science Basis", url: "https://www.ipcc.ch/report/ar6/wg1/", note: "Grundlage für Zuschreibung, Strahlungsantrieb und Konzentrationen" },
  { label: "IPCC AR6 WGIII, Mitigation of Climate Change", url: "https://www.ipcc.ch/report/ar6/wg3/", note: "Minderungspfade, Technologien und Kosten" },
  { label: "WMO, State of the Global Climate", url: "https://wmo.int/publication-series/state-of-global-climate", note: "Jahreswerte, Extremereignisse, Ozeanwärme" },
  { label: "Global Carbon Budget", url: "https://globalcarbonbudget.org/", note: "Jährliche CO₂-Emissionen und Senken" },
  { label: "IPCC AR6 Synthesis Report", url: "https://www.ipcc.ch/report/ar6/syr/", note: "Zusammenführung von Physik, Folgen und Minderung" },
];
