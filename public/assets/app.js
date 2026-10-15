/**
 * Seitenlogik: lädt die Live-Daten der eigenen API, füllt Kennzahlen und
 * Diagramme und steuert die Interaktion (Zeiträume, Legenden, Ortsauswahl).
 */
import { PALETTE, divergingColor, formatNumber, niceTicks, plot, stripes } from "./charts.js";
import {
  CARBON_BUDGET,
  EMISSIONS,
  EXTERNAL_SOURCES,
  HERO_QUOTE,
  IPCC_FIGURES,
  LIMITATIONS,
  MITIGATION,
  STRUCTURE_OF_EVIDENCE,
  WMO_YEARS,
} from "./content.js";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const AQI_LABELS = [
  [20, "gut"],
  [40, "ausreichend"],
  [60, "mäßig"],
  [80, "schlecht"],
  [100, "sehr schlecht"],
  [Number.POSITIVE_INFINITY, "extrem schlecht"],
];

const state = {
  indicators: null,
  co2Range: "full",
  co2Series: "measured",
  tempRange: "full",
  sealevelRange: "full",
  location: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clear(host) {
  if (host) host.textContent = "";
}

function formatUnit(value, digits, unit) {
  const formatted = formatNumber(value, digits);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDecimalYear(x) {
  if (!Number.isFinite(x)) return "–";
  const year = Math.floor(x);
  const fraction = x - year;
  if (fraction < 0.002) return String(year);
  const month = Math.min(11, Math.floor(fraction * 12));
  return `${MONTHS[month]} ${year}`;
}

function formatDayOfYear(doy) {
  const monthStarts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  let index = 0;
  for (let i = 0; i < monthStarts.length; i += 1) if (doy >= monthStarts[i]) index = i;
  return MONTHS[index];
}

function formatDate(iso) {
  if (!iso) return "–";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  return day ? `${day}. ${MONTHS[month - 1]} ${year}` : `${MONTHS[month - 1]} ${year}`;
}

function rollingMean(series, window = 12) {
  const out = [];
  const half = Math.floor(window / 2);
  for (let i = half; i < series.length - (window - half - 1); i += 1) {
    const slice = series.slice(i - half, i + (window - half));
    let sum = 0;
    for (const point of slice) sum += point[1];
    out.push([series[i][0], sum / slice.length]);
  }
  return out;
}

function decadalMeans(annualValues) {
  const buckets = new Map();
  for (const [year, value] of annualValues) {
    const decade = Math.floor(year / 10) * 10;
    if (!buckets.has(decade)) buckets.set(decade, []);
    buckets.get(decade).push(value);
  }
  return [...buckets.entries()]
    .filter(([, values]) => values.length >= 8)
    .sort((a, b) => a[0] - b[0])
    .map(([decade, values]) => [decade, values.reduce((a, b) => a + b, 0) / values.length]);
}

/* ------------------------------------------------------------------ */
/* Statische Inhalte                                                   */
/* ------------------------------------------------------------------ */

const CONTENT = {
  "hero-quote": HERO_QUOTE.text,
  "hero-quote-original": HERO_QUOTE.original,
  "preindustrial-co2": IPCC_FIGURES.observations.preindustrialCo2,
  "co2-increase": IPCC_FIGURES.observations.increaseSince1750.co2,
  "wmo-2024": `${formatNumber(WMO_YEARS.y2024.value, 2)} ± ${formatNumber(WMO_YEARS.y2024.uncertainty, 2)} °C`,
  "wmo-2025": `etwa ${formatNumber(WMO_YEARS.y2025.value, 2)} °C`,
  "ar6-warming": `${formatNumber(IPCC_FIGURES.observations.warming2011to2020.value, 2)} °C (Spanne ${formatNumber(
    IPCC_FIGURES.observations.warming2011to2020.range[0],
    2,
  )} bis ${formatNumber(IPCC_FIGURES.observations.warming2011to2020.range[1], 2)} °C)`,
  "ar6-human": `${formatNumber(IPCC_FIGURES.observations.humanCaused.range[0], 1)} bis ${formatNumber(
    IPCC_FIGURES.observations.humanCaused.range[1],
    1,
  )} °C (bester Schätzwert ${formatNumber(IPCC_FIGURES.observations.humanCaused.best, 2)} °C)`,
  "gistemp-offset": "0,19 °C",
  "ar6-concentrations": `${IPCC_FIGURES.observations.concentrations2019.co2}, ${IPCC_FIGURES.observations.concentrations2019.ch4} Methan und ${IPCC_FIGURES.observations.concentrations2019.n2o} Lachgas (Jahr 2019)`,
  "ar6-increases": `${IPCC_FIGURES.observations.increaseSince1750.co2} CO₂, ${IPCC_FIGURES.observations.increaseSince1750.ch4} Methan und ${IPCC_FIGURES.observations.increaseSince1750.n2o} Lachgas`,
  "cumulative-share-fossil": `${EMISSIONS.gcb2025.cumulativeShare.fossil} %`,
  "cumulative-share-land": `${EMISSIONS.gcb2025.cumulativeShare.landUse} %`,
  "gcb-fossil": `${formatNumber(EMISSIONS.gcb2025.fossil, 1)} Gt CO₂`,
  "gcb-land": `${formatNumber(EMISSIONS.gcb2025.landUse, 1)} Gt CO₂`,
  "fossil-share": `${EMISSIONS.energyMix.fossilShareOfPrimaryEnergy} %`,
  "percapita-year": String(EMISSIONS.perCapita.year),
  "percapita-world": `${formatNumber(EMISSIONS.perCapita.regions[0].value, 1)} t CO₂`,
  "percapita-de": `${formatNumber(EMISSIONS.perCapita.regions[1].value, 1)} t CO₂`,
  "percapita-us": `${formatNumber(EMISSIONS.perCapita.regions[4].value, 1)} t CO₂`,
  "percapita-in": `${formatNumber(EMISSIONS.perCapita.regions[5].value, 1)} t CO₂`,
};

const LINKS = {
  "hero-quote": { href: HERO_QUOTE.url, text: `Quelle: ${HERO_QUOTE.source}` },
};

function applyStaticContent() {
  for (const node of document.querySelectorAll("[data-content]")) {
    const value = CONTENT[node.dataset.content];
    if (value !== undefined) node.textContent = value;
  }
  for (const node of document.querySelectorAll("[data-link]")) {
    const link = LINKS[node.dataset.link];
    if (!link) continue;
    node.href = link.href;
    node.textContent = link.text;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
  }
}

function renderEvidence() {
  const grid = $("evidence-grid");
  clear(grid);
  for (const entry of STRUCTURE_OF_EVIDENCE) {
    const card = el("article", "card");
    card.append(el("h3", null, entry.title), el("p", null, entry.text));
    grid.appendChild(card);
  }
}

function renderLimitations() {
  const grid = $("limitations-grid");
  clear(grid);
  for (const entry of LIMITATIONS) {
    const card = el("article", "card");
    card.append(el("h3", null, entry.title), el("p", null, entry.text));
    grid.appendChild(card);
  }
}

function renderExternalSources() {
  const list = $("external-sources");
  clear(list);
  for (const entry of EXTERNAL_SOURCES) {
    const item = el("li");
    const link = el("a", null, entry.label);
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link, el("span", "link-list__note", ` – ${entry.note}`));
    list.appendChild(item);
  }
}

function renderMitigation() {
  const targets = $("mitigation-targets");
  clear(targets);
  for (const target of MITIGATION.targets) {
    const card = el("article", "target");
    card.append(
      el("p", "target__value", target.value),
      target.range ? el("p", "target__range", `Spanne ${target.range}`) : null,
      el("p", "target__label", target.label),
    );
    targets.appendChild(card);
  }

  const costs = $("mitigation-costs");
  clear(costs);
  for (const item of MITIGATION.costs) {
    const row = el("div", "metric");
    row.append(el("span", "metric__label", item.label), el("strong", "metric__value", item.value), el("span", "metric__note", item.note));
    costs.appendChild(row);
  }
  $("mitigation-cost-note").textContent = MITIGATION.notes[1];

  const electricity = $("mitigation-electricity");
  clear(electricity);
  for (const item of MITIGATION.electricity) {
    const row = el("div", "metric");
    row.append(el("span", "metric__label", item.label), el("strong", "metric__value", item.value));
    electricity.appendChild(row);
  }
  $("mitigation-electricity-note").textContent = MITIGATION.notes[2];
  $("mitigation-notes").textContent = MITIGATION.notes[0];

  const sources = $("mitigation-sources");
  clear(sources);
  sources.append(document.createTextNode("Quellen: "));
  MITIGATION.sources.forEach((source, index) => {
    if (index > 0) sources.append(document.createTextNode(" · "));
    const link = el("a", null, source.label);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    sources.appendChild(link);
  });
}

function renderForcing() {
  const host = $("forcing-visual");
  clear(host);
  const forcing = IPCC_FIGURES.radiativeForcing;
  const max = 3.6;

  const rowFor = (label, value, low, high, variant) => {
    const row = el("div", `forcing-row forcing-row--${variant}`);
    row.appendChild(el("p", "forcing-row__label", label));
    const track = el("div", "forcing-track");
    const range = el("div", "forcing-range");
    range.style.left = `${(low / max) * 100}%`;
    range.style.width = `${((high - low) / max) * 100}%`;
    track.appendChild(range);
    const marker = el("div", "forcing-marker");
    marker.style.left = `${(value / max) * 100}%`;
    track.appendChild(marker);
    row.appendChild(track);
    const valueNode = el("p", "forcing-row__value");
    valueNode.append(
      el("strong", null, `${formatNumber(value, 2)} ${forcing.unit}`),
      variant === "human" ? el("span", null, ` Spanne ${formatNumber(low, 2)} bis ${formatNumber(high, 2)}`) : el("span", null, " nahe null"),
    );
    row.appendChild(valueNode);
    return row;
  };

  host.append(
    rowFor("Menschliche Antriebe, 2019 gegenüber 1750", forcing.value, forcing.range[0], forcing.range[1], "human"),
    rowFor("Sonnenaktivität und Vulkanismus seit 1750", 0, 0, 0.05, "natural"),
  );
}

function renderCumulativeBar() {
  const host = $("cumulative-bar");
  const legend = $("cumulative-legend");
  clear(host);
  clear(legend);
  const { fossil, landUse } = EMISSIONS.gcb2025.cumulativeShare;
  const fossilPart = el("div", "cumulative-bar__part cumulative-bar__part--fossil");
  fossilPart.style.width = `${fossil}%`;
  fossilPart.append(el("span", null, `${fossil} %`));
  const landPart = el("div", "cumulative-bar__part cumulative-bar__part--land");
  landPart.style.width = `${landUse}%`;
  landPart.append(el("span", null, `${landUse} %`));
  host.append(fossilPart, landPart);

  const legendRow = (color, label) => {
    const item = el("span", "legend-item legend-item--static");
    const swatch = el("span", "legend-swatch");
    swatch.style.background = color;
    item.append(swatch, el("span", null, label));
    return item;
  };
  legend.append(
    legendRow(PALETTE.co2, "Fossile Energieträger und Industrie"),
    legendRow(PALETTE.neutral, "Landnutzungsänderungen"),
  );

  $("emissions-source").textContent = `Quelle: ${EMISSIONS.gcb2025.source} · kumulative Anteile ${EMISSIONS.gcb2025.cumulativePeriod}`;
  $("forcing-source").textContent = `${IPCC_FIGURES.radiativeForcing.statement} Quelle: ${IPCC_FIGURES.radiativeForcing.source}.`;
}

/* ------------------------------------------------------------------ */
/* Budget-Rechner                                                      */
/* ------------------------------------------------------------------ */

function renderBudget() {
  const limit = Number.parseFloat($("budget-limit").value);
  const probability = Number.parseInt($("budget-prob").value, 10);
  const row = CARBON_BUDGET.ar6.rows.find((entry) => Math.abs(entry.limit - limit) < 0.001);
  const budget = probability === 67 ? row.p67 : row.p50;
  const years = budget / CARBON_BUDGET.updated.annualEmissions;

  $("budget-value").textContent = formatNumber(budget, 0);
  $("budget-years").textContent =
    `Bei konstant ${formatNumber(CARBON_BUDGET.updated.annualEmissions, 0)} Gt CO₂ pro Jahr entspräche das ` +
    `${formatNumber(years, 1)} Jahren Emissionen. Die aktuellere Schätzung nennt für 1,5 °C und 50 % ein Restbudget von ` +
    `${formatNumber(CARBON_BUDGET.updated.remainingFor15C_50, 0)} Gt CO₂ (Stand ${CARBON_BUDGET.updated.asOf}).`;
  $("budget-note").textContent = `${CARBON_BUDGET.disclaimer} ${CARBON_BUDGET.updated.note}`;
}

/* ------------------------------------------------------------------ */
/* Diagramm-Helfer                                                     */
/* ------------------------------------------------------------------ */

function chartHost(id) {
  const host = $(id);
  clear(host);
  return host;
}

/**
 * Steuerelemente der Diagramme. Der gedrückte Zustand wird nach jeder Auswahl
 * neu aufgebaut, damit die Anzeige zum tatsächlich dargestellten Zeitraum passt.
 */
const CONTROL_DEFS = {
  co2: () => [
    { value: "full", label: "seit 1958", active: state.co2Range === "full" },
    { value: "twenty", label: "20 Jahre", active: state.co2Range === "twenty" },
    { value: "five", label: "5 Jahre", active: state.co2Range === "five" },
    { value: "both", label: "Saison bereinigt", active: state.co2Series === "both", separate: true },
  ],
  temperature: () => [
    { value: "full", label: "seit 1880", active: state.tempRange === "full" },
    { value: "since1950", label: "seit 1950", active: state.tempRange === "since1950" },
    { value: "last30", label: "letzte 30 Jahre", active: state.tempRange === "last30" },
  ],
  sealevel: () => [
    { value: "full", label: "seit 1993", active: state.sealevelRange === "full" },
    { value: "ten", label: "letzte 10 Jahre", active: state.sealevelRange === "ten" },
  ],
};

function renderControls(name) {
  const host = $(`${name}-controls`);
  if (!host || !CONTROL_DEFS[name]) return;
  clear(host);
  for (const option of CONTROL_DEFS[name]()) {
    const button = el("button", "control-button", option.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(Boolean(option.active)));
    button.classList.toggle("is-active", Boolean(option.active));
    button.title = option.separate ? "Saisonal bereinigte Reihe zusätzlich einblenden" : "Zeitraum wählen";
    button.addEventListener("click", () => handleControl(name, option.value));
    host.appendChild(button);
  }
}

function handleControl(name, value) {
  if (name === "co2") {
    if (value === "both") state.co2Series = state.co2Series === "both" ? "measured" : "both";
    else state.co2Range = value;
    renderCo2Chart(state.indicators);
  } else if (name === "temperature") {
    state.tempRange = value;
    renderTemperatureChart(state.indicators);
  } else if (name === "sealevel") {
    state.sealevelRange = value;
    renderSeaLevelChart(state.indicators);
  }
  renderControls(name);
}

function sourceNote(id, source, extra) {
  const host = $(id);
  if (!host) return;
  clear(host);
  if (!source) {
    host.textContent = extra ?? "";
    return;
  }
  host.append(document.createTextNode("Quelle: "));
  const link = el("a", null, `${source.provider} – ${source.label}`);
  link.href = source.homepage ?? source.dataUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  host.appendChild(link);
  const parts = [];
  if (source.lastObservation) parts.push(`jüngster Wert ${formatDate(source.lastObservation)}`);
  if (source.points) parts.push(`${new Intl.NumberFormat("de-DE").format(source.points)} verarbeitete Messwerte`);
  if (source.status === "error") parts.push(`Quelle derzeit nicht verfügbar: ${source.error?.message ?? "unbekannter Fehler"}`);
  if (extra) parts.push(extra);
  if (parts.length) host.append(document.createTextNode(` · ${parts.join(" · ")}`));
}

function findSource(ind, key) {
  return ind.sources?.find((entry) => entry.key === key) ?? null;
}

/* ------------------------------------------------------------------ */
/* Kennzahlen                                                          */
/* ------------------------------------------------------------------ */

function kpiCard({ label, value, unit, note, delta, href }) {
  const card = el("article", "kpi");
  card.appendChild(el("p", "kpi__label", label));
  const valueNode = el("p", "kpi__value", value);
  if (unit) valueNode.appendChild(el("span", "kpi__unit", ` ${unit}`));
  card.appendChild(valueNode);
  if (delta) card.appendChild(el("p", "kpi__delta", delta));
  if (note) card.appendChild(el("p", "kpi__note", note));
  if (href) {
    const link = el("a", "kpi__link", "Details");
    link.href = href;
    card.appendChild(link);
  }
  return card;
}

function renderKpis(ind) {
  const grid = $("kpi-grid");
  clear(grid);
  grid.removeAttribute("aria-busy");
  const cards = [];

  const co2 = ind.co2?.stats;
  if (co2?.latest) {
    cards.push({
      label: "CO₂ in der Atmosphäre",
      value: formatNumber(co2.latest.value, 1),
      unit: "ppm",
      delta: co2.latest.increaseVsYearAgo !== null ? `+${formatNumber(co2.latest.increaseVsYearAgo, 1)} ppm gegenüber dem Vorjahr` : null,
      note: `Mauna Loa, Messung vom ${formatDate(co2.latest.date)}. Seit 1800 um ${formatNumber(co2.latest.since1800, 0)} ppm gestiegen.`,
      href: "#co2",
    });
  }

  const temperature = ind.temperature?.stats;
  if (temperature?.lastTwelveMonths) {
    cards.push({
      label: "Globale Temperatur, 12-Monats-Mittel",
      value: `+${formatNumber(temperature.lastTwelveMonths.value, 2)}`,
      unit: "°C",
      delta: `gegenüber 1951–1980 · ${temperature.lastTwelveMonths.from} bis ${temperature.lastTwelveMonths.to}`,
      note: `Näherung gegenüber 1850–1900: rund +${formatNumber(temperature.lastTwelveMonths.value + temperature.preindustrialOffset, 2)} °C.`,
      href: "#temperatur",
    });
  }

  const methane = ind.methane?.stats;
  if (methane?.latest) {
    cards.push({
      label: "Methan in der Atmosphäre",
      value: formatNumber(methane.latest.value, 0),
      unit: "ppb",
      delta:
        methane.annualIncrease !== null
          ? `${methane.annualIncrease > 0 ? "+" : ""}${formatNumber(methane.annualIncrease, 1)} ppb im Vorjahresvergleich`
          : null,
      note: `Globales Mittel der Messstationen, Stand ${formatDate(methane.latest.date)}.`,
      href: "#gase",
    });
  }

  const seaIce = ind.seaIce?.stats;
  if (seaIce?.lastSeptember) {
    cards.push({
      label: "Arktisches Meereis, September-Minimum",
      value: formatNumber(seaIce.lastSeptember.value, 2),
      unit: "Mio. km²",
      delta:
        seaIce.lastSeptember.anomalyPercent !== null
          ? `${formatNumber(seaIce.lastSeptember.anomalyPercent, 1)} % gegenüber dem Mittel 1981–2010`
          : null,
      note: `Jahr ${seaIce.lastSeptember.year}. Tiefster Wert der Reihe: ${formatNumber(seaIce.recordLowSeptember.value, 2)} Mio. km² im Jahr ${seaIce.recordLowSeptember.year}.`,
      href: "#meereis",
    });
  }

  const seaLevel = ind.seaLevel?.stats;
  if (seaLevel?.latest) {
    cards.push({
      label: "Globaler Meeresspiegel",
      value: `+${formatNumber(seaLevel.latest.value, 0)}`,
      unit: "mm",
      delta: `Anstieg von ${formatNumber(seaLevel.rateLastTenYears, 2)} mm pro Jahr im letzten Jahrzehnt`,
      note: `Satellitenmessung, Stand ${formatDate(seaLevel.latest.date)}.`,
      href: "#meeresspiegel",
    });
  }

  if (!cards.length) {
    grid.appendChild(el("p", "loading", "Kennzahlen konnten nicht geladen werden."));
    return;
  }
  for (const card of cards) grid.appendChild(kpiCard(card));
}

/* ------------------------------------------------------------------ */
/* Indikator-Diagramme                                                 */
/* ------------------------------------------------------------------ */

function renderCo2Chart(ind) {
  const host = chartHost("chart-co2");
  const monthly = ind.co2?.monthly ?? [];
  if (!monthly.length) {
    host.appendChild(el("p", "loading", "CO₂-Daten derzeit nicht verfügbar."));
    return;
  }
  const ranges = {
    full: { from: 0, label: "seit 1958" },
    twenty: { from: monthly[monthly.length - 1][0] - 20, label: "20 Jahre" },
    five: { from: monthly[monthly.length - 1][0] - 5, label: "5 Jahre" },
  };
  const range = ranges[state.co2Range] ?? ranges.full;
  const points = monthly.filter((row) => row[0] >= range.from);
  const measured = points.map((row) => [row[0], row[1]]);
  const adjusted = points.filter((row) => row[2] !== null).map((row) => [row[0], row[2]]);

  const series = [
    { id: "measured", label: "Monatsmittel", color: PALETTE.co2, points: measured, width: 1.8, digits: 1, unit: "ppm" },
  ];
  if (state.co2Series === "both") {
    series.push({
      id: "adjusted",
      label: "Saisonal bereinigt",
      color: PALETTE.co2Seasonal,
      points: adjusted,
      width: 1.4,
      dash: "5 3",
      digits: 1,
      unit: "ppm",
    });
  }

  const last = measured[measured.length - 1];
  plot(host, {
    height: 320,
    series,
    x: { format: (value) => (state.co2Range === "full" ? String(Math.round(value)) : formatDecimalYear(value)) },
    y: { digits: 1, unit: "ppm", zero: false },
    markers: last ? [{ x: last[0], y: last[1], label: `Zuletzt ${formatNumber(last[1], 1)} ppm`, color: PALETTE.co2 }] : [],
    tooltipExtra: (active) => {
      const point = active[0]?.point;
      return point && point.length > 2 && point[2] !== null ? `Saisonal bereinigt: ${formatNumber(point[2], 1)} ppm` : null;
    },
  });
}

function renderCo2AnnualChart(ind) {
  const host = chartHost("chart-co2-annual");
  const annual = ind.co2?.annual ?? [];
  const growth = ind.co2?.growthRate ?? [];
  if (!annual.length || !growth.length) {
    host.appendChild(el("p", "loading", "Daten derzeit nicht verfügbar."));
    return;
  }
  plot(host, {
    height: 300,
    series: [
      {
        id: "growth",
        label: "Anstieg pro Jahr",
        color: PALETTE.co2,
        kind: "bars",
        points: growth.map((row) => [row[0], row[1]]),
        opacity: 0.55,
        digits: 2,
        unit: "ppm",
      },
      {
        id: "level",
        label: "Jahresmittel",
        color: PALETTE.co2Seasonal,
        points: annual.map((row) => [row[0], row[1]]),
        yAxis: 2,
        width: 1.6,
        digits: 1,
        unit: "ppm",
      },
    ],
    x: { format: (value) => String(Math.round(value)) },
    y: { digits: 1, unit: "ppm" },
    y2: { digits: 0, format: (value) => formatNumber(value, 0) },
  });
}

function renderCo2Panel(ind) {
  const host = $("co2-panel");
  clear(host);
  host.appendChild(el("h3", null, "Derzeitige Werte"));
  const stats = ind.co2?.stats;
  if (!stats) {
    host.appendChild(el("p", "loading", "Nicht verfügbar."));
    return;
  }
  const list = el("dl", "stat-list");
  const add = (term, value, note) => {
    list.appendChild(el("dt", null, term));
    const dd = el("dd", null, value);
    if (note) dd.appendChild(el("span", "stat-list__note", ` ${note}`));
    list.appendChild(dd);
  };
  if (stats.latest) {
    add("Letzte Wochenmessung", `${formatNumber(stats.latest.value, 2)} ppm`, `${formatDate(stats.latest.date)}, Vorjahr ${formatNumber(stats.latest.yearAgo, 2)} ppm`);
    add("Anstieg seit 1800", `${formatNumber(stats.latest.since1800, 0)} ppm`, "aus der Originaldatei");
  }
  if (stats.lastFullYear) add("Jahresmittel des letzten vollen Jahres", `${formatNumber(stats.lastFullYear.value, 2)} ppm`, String(stats.lastFullYear.year));
  if (stats.growthLastFullYear) add("Anstieg im letzten vollen Jahr", `${formatNumber(stats.growthLastFullYear.value, 2)} ppm`, String(stats.growthLastFullYear.year));
  if (stats.trendPerDecade) add(`Trend der letzten ${stats.trendWindowMonths} Monate`, `${formatNumber(stats.trendPerDecade, 2)} ppm pro Dekade`);
  add("Vorindustrieller Bezugswert", `${formatNumber(stats.preindustrialReference, 0)} ppm`, "nach IPCC AR6");
  host.appendChild(list);
}

function renderTemperatureChart(ind) {
  const host = chartHost("chart-temperature");
  const annual = ind.temperature?.annual ?? [];
  const monthly = ind.temperature?.monthly ?? [];
  if (!annual.length) {
    host.appendChild(el("p", "loading", "Temperaturdaten derzeit nicht verfügbar."));
    return;
  }
  const ranges = { full: 0, since1950: 1950, last30: annual[annual.length - 1][0] - 30 };
  const from = ranges[state.tempRange] ?? 0;
  const annualPoints = annual.filter((row) => row[0] >= from);
  const monthlyPoints = monthly.filter((row) => row[0] >= from - 1);
  const running = rollingMean(monthlyPoints, 12);

  plot(host, {
    height: 320,
    series: [
      {
        id: "annual",
        label: "Jahresmittel",
        color: PALETTE.neutral,
        kind: "bars",
        points: annualPoints.map((row) => [row[0], row[1]]),
        opacity: 0.75,
        colorFor: (value) => divergingColor(value, 1.2),
        digits: 2,
        unit: "°C",
      },
      {
        id: "running",
        label: "Gleitendes 12-Monats-Mittel",
        color: PALETTE.temperature,
        points: running,
        width: 2.2,
        digits: 2,
        unit: "°C",
      },
    ],
    x: { format: (value) => String(Math.round(value)) },
    y: { digits: 1, zero: true, unit: "°C" },
    guides: [{ x: new Date().getUTCFullYear() - 1, label: "", color: PALETTE.axis }],
  });
}

function renderTemperaturePanel(ind) {
  const host = $("temperature-panel");
  clear(host);
  host.appendChild(el("h3", null, "Einordnung"));
  const stats = ind.temperature?.stats;
  if (!stats) {
    host.appendChild(el("p", "loading", "Nicht verfügbar."));
    return;
  }
  const list = el("dl", "stat-list");
  const add = (term, value, note) => {
    list.appendChild(el("dt", null, term));
    const dd = el("dd", null, value);
    if (note) dd.appendChild(el("span", "stat-list__note", ` ${note}`));
    list.appendChild(dd);
  };
  if (stats.lastFullYear) {
    add(
      `Jahr ${stats.lastFullYear.year}`,
      `${formatNumber(stats.lastFullYear.value, 2)} °C`,
      `gegenüber 1951–1980, das sind rund ${formatNumber(stats.lastFullYear.value + stats.preindustrialOffset, 2)} °C gegenüber 1850–1900`,
    );
  }
  if (stats.warmestYear) add("Wärmstes Jahr der Reihe", `${formatNumber(stats.warmestYear.value, 2)} °C`, String(stats.warmestYear.year));
  if (stats.decades?.length) {
    const first = stats.decades[0];
    const last = stats.decades[stats.decades.length - 1];
    add(
      `Dekadenmittel ${first.decade}er bis ${last.decade}er`,
      `${formatNumber(first.value, 2)} °C → ${formatNumber(last.value, 2)} °C`,
      `Zunahme um ${formatNumber(last.value - first.value, 2)} °C`,
    );
  }
  add("Bezugszeitraum", "1951–1980", "GISTEMP-Basis");
  host.appendChild(list);
}

function renderGasChart(ind, key, hostId, color) {
  const host = chartHost(hostId);
  const gas = ind[key];
  if (!gas?.monthly?.length) {
    host.appendChild(el("p", "loading", "Daten derzeit nicht verfügbar."));
    return;
  }
  const series = [
    { id: "value", label: "Monatsmittel", color, points: gas.monthly, width: 1.7, digits: 1, unit: gas.unit },
  ];
  if (gas.trend?.length) {
    series.push({
      id: "trend",
      label: "Bereinigter Trend",
      color: PALETTE.neutral,
      points: gas.trend,
      width: 1.3,
      dash: "5 3",
      digits: 1,
      unit: gas.unit,
    });
  }
  const last = gas.monthly[gas.monthly.length - 1];
  plot(host, {
    height: 260,
    series,
    x: { format: (value) => String(Math.round(value)) },
    y: { digits: 0, unit: gas.unit },
    markers: last ? [{ x: last[0], y: last[1], label: `${formatNumber(last[1], 0)} ${gas.unit}`, color }] : [],
  });
}

function renderGasPanel(ind) {
  const host = $("gas-panel");
  clear(host);
  host.appendChild(el("h3", null, "Aktuelle Anstiege"));
  const list = el("dl", "stat-list");
  const add = (term, value, note) => {
    list.appendChild(el("dt", null, term));
    const dd = el("dd", null, value);
    if (note) dd.appendChild(el("span", "stat-list__note", ` ${note}`));
    list.appendChild(dd);
  };
  const methane = ind.methane?.stats;
  const n2o = ind.nitrousOxide?.stats;
  if (methane?.latest) {
    add(
      "Methan",
      `${formatNumber(methane.latest.value, 1)} ppb`,
      `12-Monats-Mittel ${formatNumber(methane.twelveMonthMean, 1)} ppb, im Vorjahresvergleich ${methane.annualIncrease > 0 ? "+" : ""}${formatNumber(methane.annualIncrease, 1)} ppb`,
    );
  }
  if (n2o?.latest) {
    add(
      "Lachgas",
      `${formatNumber(n2o.latest.value, 1)} ppb`,
      `12-Monats-Mittel ${formatNumber(n2o.twelveMonthMean, 1)} ppb, im Vorjahresvergleich ${n2o.annualIncrease > 0 ? "+" : ""}${formatNumber(n2o.annualIncrease, 1)} ppb`,
    );
  }
  host.append(list);
  host.append(
    el(
      "p",
      "note",
      "Methan wirkt über 100 Jahre etwa 27- bis 30-mal stärker als CO₂, über 20 Jahre etwa 80-mal. Der Vergleich hängt " +
        "vom betrachteten Zeitraum ab und wird deshalb ohne einzelne Kurzform angegeben.",
    ),
  );
}

function renderSeaIceCharts(ind) {
  const host = chartHost("chart-seaice-sept");
  const seaIce = ind.seaIce;
  if (!seaIce?.septemberMin?.length) {
    host.appendChild(el("p", "loading", "Meereisdaten derzeit nicht verfügbar."));
  } else {
    const climatology = seaIce.stats?.lastSeptember?.climatology1981to2010;
    const points = seaIce.septemberMin;
    const record = seaIce.stats?.recordLowSeptember;
    plot(host, {
      height: 300,
      series: [
        { id: "sept", label: "September-Minimum", color: PALETTE.seaIce, points, width: 1.8, digits: 2, unit: "Mio. km²" },
        // Wert der Referenzlinie steht in der Legende, damit die Beschriftung nicht auf der Kurve liegt.
        {
          id: "climatology",
          label: climatology ? `Mittel 1981–2010: ${formatNumber(climatology, 2)} Mio. km²` : "Mittel 1981–2010",
          color: PALETTE.neutral,
          dash: "4 4",
          width: 1.4,
          points: [],
          interactive: false,
        },
      ],
      x: { format: (value) => String(Math.round(value)) },
      y: { digits: 1, unit: "Mio. km²" },
      yGuides: climatology ? [{ y: climatology, color: PALETTE.neutral }] : [],
      markers: record
        ? [{ x: record.year, y: record.value, label: `Rekordtief ${record.year}`, color: PALETTE.temperature }]
        : [],
      tooltipExtra: () => {
        const slope = seaIce.stats?.trendPerDecade;
        return slope !== null && slope !== undefined ? `Trend: ${formatNumber(slope, 2)} Mio. km² pro Dekade` : null;
      },
    });
  }

  const seasonHost = chartHost("chart-seaice-season");
  if (!seaIce?.currentYearDaily?.length || !seaIce?.climatology?.length) {
    seasonHost.appendChild(el("p", "loading", "Jahresverlauf derzeit nicht verfügbar."));
    return;
  }
  const monthTicks = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const series = [
    {
      id: "climatology",
      label: "Mittel 1981–2010",
      color: PALETTE.neutral,
      points: seaIce.climatology,
      width: 1.6,
      dash: "5 3",
      digits: 2,
      unit: "Mio. km²",
    },
  ];
  if (seaIce.recordYearDaily?.points?.length) {
    series.push({
      id: "record",
      label: `Rekordjahr ${seaIce.recordYearDaily.year}`,
      color: PALETTE.temperature,
      points: seaIce.recordYearDaily.points,
      width: 1.5,
      digits: 2,
      unit: "Mio. km²",
    });
  }
  series.push({
    id: "current",
    label: `Laufendes Jahr ${new Date().getUTCFullYear()}`,
    color: PALETTE.seaIce,
    points: seaIce.currentYearDaily,
    width: 2,
    digits: 2,
    unit: "Mio. km²",
  });

  plot(seasonHost, {
    height: 300,
    series,
    x: { domain: [1, 366], tickValues: monthTicks, format: (value) => formatDayOfYear(value) },
    y: { digits: 1, unit: "Mio. km²" },
  });
}

function renderSeaLevelChart(ind) {
  const host = chartHost("chart-sealevel");
  const stats = ind.seaLevel?.stats;
  const series = ind.seaLevel?.series ?? [];
  if (!series.length) {
    host.appendChild(el("p", "loading", "Meeresspiegeldaten derzeit nicht verfügbar."));
    return;
  }
  const last = series[series.length - 1];
  const from = state.sealevelRange === "ten" ? last[0] - 10 : series[0][0];
  const points = series.filter((row) => row[0] >= from);
  const slope = state.sealevelRange === "ten" ? stats?.rateLastTenYears : stats?.rateSince1993;
  const first = points[0];
  const lastVisible = points[points.length - 1];
  const trendLine = first && lastVisible && slope
    ? [
        [first[0], first[1]],
        [lastVisible[0], lastVisible[1]],
      ]
    : [];

  plot(host, {
    height: 300,
    series: [
      { id: "level", label: "Meeresspiegel", color: PALETTE.seaLevel, points, width: 1.8, digits: 1, unit: "mm" },
      {
        id: "trend",
        label: `Linearer Trend ${formatNumber(slope, 2)} mm pro Jahr`,
        color: PALETTE.co2Seasonal,
        points: trendLine,
        width: 1.6,
        dash: "6 4",
        digits: 1,
        unit: "mm",
        interactive: false,
      },
    ],
    x: { format: (value) => formatDecimalYear(value) },
    y: { digits: 0, unit: "mm" },
    markers: last ? [{ x: last[0], y: last[1], label: `+${formatNumber(last[1], 0)} mm`, color: PALETTE.seaLevel }] : [],
  });
}

function renderSeaLevelPanel(ind) {
  const host = $("sealevel-panel");
  clear(host);
  host.appendChild(el("h3", null, "Anstiegsraten"));
  const stats = ind.seaLevel?.stats;
  if (!stats) {
    host.appendChild(el("p", "loading", "Nicht verfügbar."));
    return;
  }
  const list = el("dl", "stat-list");
  const add = (term, value, note) => {
    list.appendChild(el("dt", null, term));
    const dd = el("dd", null, value);
    if (note) dd.appendChild(el("span", "stat-list__note", ` ${note}`));
    list.appendChild(dd);
  };
  if (stats.latest) add("Aktueller Wert", `+${formatNumber(stats.latest.value, 1)} mm`, `Stand ${formatDate(stats.latest.date)}`);
  if (stats.rateSince1993) add("Anstieg pro Jahr seit Beginn der Satellitenmessung", `${formatNumber(stats.rateSince1993, 2)} mm`, "lineare Regression über die gesamte Reihe");
  if (stats.rateLastTenYears) add("Anstieg pro Jahr im letzten Jahrzehnt", `${formatNumber(stats.rateLastTenYears, 2)} mm`, "die Rate hat sich gegenüber den 1990er-Jahren etwa verdoppelt");
  add("Seriesbeginn", formatDate(stats.startOfSeries), "Bezug: Mittel der ersten Messjahre");
  host.appendChild(list);
}

function renderPerCapitaChart() {
  const host = chartHost("chart-percapita");
  const regions = EMISSIONS.perCapita.regions;
  const world = regions[0].value;
  plot(host, {
    height: 260,
    series: [
      {
        id: "percapita",
        label: `${EMISSIONS.perCapita.unit}, ${EMISSIONS.perCapita.year}`,
        color: PALETTE.co2,
        kind: "bars",
        points: regions.map((region, index) => [index, region.value]),
        colorFor: (value) => (value > world ? PALETTE.temperature : PALETTE.cold),
        digits: 1,
        unit: "t",
      },
      {
        id: "world",
        label: `Weltdurchschnitt ${formatNumber(world, 1)} t`,
        color: PALETTE.neutral,
        points: [
          [-0.5, world],
          [regions.length - 0.5, world],
        ],
        width: 1.4,
        dash: "6 4",
        digits: 1,
        unit: "t",
        interactive: false,
      },
    ],
    x: {
      domain: [-0.6, regions.length - 0.4],
      tickValues: regions.map((_, index) => index),
      format: (value) => regions[Math.round(value)]?.name ?? "",
    },
    // Balken beginnen bei null: Pro-Kopf-Emissionen sind Mengen, kein Trend.
    y: { digits: 0, unit: "t CO₂ je Person", zero: true },
    bars: { zero: 0 },
  });
  sourceNote("percapita-source", {
    provider: EMISSIONS.perCapita.source,
    label: EMISSIONS.perCapita.method,
    homepage: EMISSIONS.perCapita.url,
  });
}

/* ------------------------------------------------------------------ */
/* Quellentabelle                                                      */
/* ------------------------------------------------------------------ */

function renderSourcesTable(ind) {
  const body = $("sources-table")?.querySelector("tbody");
  if (!body) return;
  clear(body);
  for (const source of ind.sources ?? []) {
    const row = document.createElement("tr");
    const indicator = document.createElement("th");
    indicator.scope = "row";
    const link = el("a", null, source.label ?? source.key);
    link.href = source.homepage ?? source.dataUrl ?? "#quellen";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    indicator.appendChild(link);
    row.appendChild(indicator);
    row.appendChild(el("td", null, source.provider ?? "–"));
    row.appendChild(el("td", null, source.cadence ?? "–"));
    row.appendChild(el("td", null, source.lastObservation ? formatDate(source.lastObservation) : "–"));
    row.appendChild(el("td", "numeric", source.points ? new Intl.NumberFormat("de-DE").format(source.points) : "–"));
    const statusCell = el("td");
    if (source.status === "ok") {
      statusCell.appendChild(el("span", "badge badge--ok", "verfügbar"));
    } else {
      const badge = el("span", "badge badge--error", "Fehler");
      badge.title = source.error?.message ?? "";
      statusCell.appendChild(badge);
    }
    row.appendChild(statusCell);
    body.appendChild(row);
  }
}

function updateStatus(ind) {
  const ok = (ind.sources ?? []).filter((entry) => entry.status === "ok").length;
  const total = (ind.sources ?? []).length;
  const generated = new Date(ind.generatedAt);
  const stamp = generated.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  $("update-status-text").textContent = `Datenstand ${stamp} · ${ok} von ${total} Quellen verfügbar`;
  $("footer-meta").textContent =
    `Auswertung erzeugt am ${stamp}. Zwischenspeicher: ${ind.cached?.hit ? "Treffer" : "neu berechnet"}. ` +
    `Bezugsperioden: Temperatur ${ind.references?.gistempBaseline ?? "1951–1980"}, Meereis ${ind.references?.seaIceClimatology ?? "1981–2010"}.`;
}

function fillSections(ind) {
  sourceNote("co2-source", findSource(ind, "co2"), `Monatsreihe ${ind.co2?.stats?.monthlyCoverage ?? ""}`);
  sourceNote("co2-annual-source", findSource(ind, "co2"));
  sourceNote("temperature-source", findSource(ind, "temperature"));
  sourceNote("ch4-source", findSource(ind, "methane"));
  sourceNote("n2o-source", findSource(ind, "nitrousOxide"));
  sourceNote("seaice-source", findSource(ind, "seaIce"));
  sourceNote("seaice-season-source", findSource(ind, "seaIce"));
  sourceNote("sealevel-source", findSource(ind, "seaLevel"));
}

async function loadIndicators() {
  try {
    const response = await fetch("/api/indicators", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`API antwortete mit ${response.status}`);
    const ind = await response.json();
    state.indicators = ind;
    renderKpis(ind);
    renderCo2Chart(ind);
    renderCo2AnnualChart(ind);
    renderCo2Panel(ind);
    renderTemperatureChart(ind);
    renderTemperaturePanel(ind);
    renderGasChart(ind, "methane", "chart-ch4", PALETTE.methane);
    renderGasChart(ind, "nitrousOxide", "chart-n2o", PALETTE.nitrousOxide);
    renderGasPanel(ind);
    renderSeaIceCharts(ind);
    renderSeaLevelChart(ind);
    renderSeaLevelPanel(ind);
    renderSourcesTable(ind);
    fillSections(ind);
    updateStatus(ind);
  } catch (error) {
    $("update-status-text").textContent = `Daten konnten nicht geladen werden: ${error.message}`;
    for (const id of ["kpi-grid", "chart-co2", "chart-temperature"]) {
      const host = $(id);
      if (host) {
        clear(host);
        host.appendChild(el("p", "error", `Fehler beim Laden: ${error.message}`));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ortsauswertung                                                      */
/* ------------------------------------------------------------------ */

const local = {
  chartAnnual: null,
  chartExtremes: null,
  chartProjection: null,
};

function setLocalStatus(message, variant) {
  const node = $("local-status");
  node.textContent = message ?? "";
  node.className = variant ? `form-note form-note--${variant}` : "form-note";
}

async function loadLocal(lat, lon, label) {
  state.location = { lat, lon, label };
  setLocalStatus(`Auswertung für ${label} wird berechnet – das kann beim ersten Aufruf einige Sekunden dauern.`);
  const query = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const url = new URL(window.location.href);
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lon.toFixed(4));
  url.searchParams.set("ort", label);
  window.history.replaceState({}, "", url);

  try {
    const [current, climate] = await Promise.all([
      fetch(`/api/local/current?${query}`).then((response) => {
        if (!response.ok) throw new Error(`Wetterdaten: HTTP ${response.status}`);
        return response.json();
      }),
      fetch(`/api/local/climate?${query}`).then((response) => {
        if (!response.ok) throw new Error(`Klimaauswertung: HTTP ${response.status}`);
        return response.json();
      }),
    ]);
    renderLocalKpis(current, climate, label);
    renderLocalStripes(climate);
    renderLocalAnnual(climate);
    renderLocalExtremes(climate);
    setupProjection(lat, lon, climate);
    renderLocalCurrent(current);
    setLocalStatus(`Ausgewertet: ${label} (${lat.toFixed(3)}°, ${lon.toFixed(3)}°). Datenstand ${formatDate(climate.observed?.coverage?.split("–")[1] ?? "")}.`);
  } catch (error) {
    setLocalStatus(`Auswertung fehlgeschlagen: ${error.message}`, "error");
  }
}

function renderLocalKpis(current, climate, label) {
  const grid = $("local-kpis");
  clear(grid);
  const cards = [];
  const stats = climate.observed?.stats;
  if (current.current) {
    cards.push({
      label: "Aktuelle Temperatur",
      value: formatNumber(current.current.temperature, 1),
      unit: "°C",
      delta: `gefühlt ${formatNumber(current.current.apparent, 1)} °C`,
      note: `Luftfeuchte ${formatNumber(current.current.humidity, 0)} %, Wind ${formatNumber(current.current.windSpeed, 0)} km/h, Stand ${current.current.time?.slice(11, 16)} Uhr Ortszeit.`,
    });
  }
  if (current.air) {
    const aqi = current.air.europeanAqi;
    const label2 = AQI_LABELS.find(([limit]) => aqi <= limit)?.[1] ?? "unbekannt";
    cards.push({
      label: "Luftqualität",
      value: formatNumber(current.air.pm25, 1),
      unit: "µg/m³ PM2,5",
      delta: aqi !== null && aqi !== undefined ? `europäischer Index ${formatNumber(aqi, 0)} (${label2})` : null,
      note: "Feinstaubwerte schwanken stark mit Wetterlage und Heizverhalten.",
    });
  }
  if (stats?.lastDecadeAnomaly !== undefined && stats.lastDecadeAnomaly !== null) {
    cards.push({
      label: "Erwärmung vor Ort",
      value: `${stats.lastDecadeAnomaly > 0 ? "+" : ""}${formatNumber(stats.lastDecadeAnomaly, 2)}`,
      unit: "°C",
      delta: `Mittel der letzten zehn Jahre gegenüber 1951–1980`,
      note: `Trend ${formatNumber(stats.trendPerDecade, 2)} °C pro Dekade seit ${climate.observed.coverage?.split("–")[0]}.`,
    });
  }
  const projectionDelta =
    climate.projection?.stats && climate.projection.stats.mean2041to2050 !== null
      ? climate.projection.stats.mean2041to2050 - climate.projection.stats.mean2020to2025
      : null;
  if (projectionDelta !== null) {
    cards.push({
      label: "Projektion 2041–2050",
      value: `${projectionDelta > 0 ? "+" : ""}${formatNumber(projectionDelta, 2)}`,
      unit: "°C",
      delta: "gegenüber dem Modellmittel 2020–2025",
      note:
        `Modellmittel 2020–2025: ${formatNumber(climate.projection.stats.mean2020to2025, 1)} °C, 2041–2050: ${formatNumber(climate.projection.stats.mean2041to2050, 1)} °C` +
        (climate.projection.stats.spread2041to2050
          ? `; Spanne zwischen den Modellen im Zieljahrzehnt ${formatNumber(climate.projection.stats.spread2041to2050[0], 1)} bis ${formatNumber(climate.projection.stats.spread2041to2050[1], 1)} °C.`
          : "."),
    });
  }
  if (climate.observed?.stats?.lastCompleteYear) {
    const year = climate.observed.stats.lastCompleteYear;
    cards.push({
      label: `Jahr ${year.year} am Ort`,
      value: formatNumber(year.value, 1),
      unit: "°C",
      delta: `${year.anomalyToBaseline > 0 ? "+" : ""}${formatNumber(year.anomalyToBaseline, 2)} °C gegenüber 1951–1980`,
      note: `Wärmstes Jahr der Reihe: ${climate.observed.stats.warmest?.year} mit ${formatNumber(climate.observed.stats.warmest?.value, 1)} °C.`,
    });
  }
  if (!cards.length) {
    grid.appendChild(el("p", "loading", `Für ${label} liegen keine Kennzahlen vor.`));
    return;
  }
  for (const card of cards) grid.appendChild(kpiCard(card));
}

function renderLocalStripes(climate) {
  const host = chartHost("local-stripes");
  const points = climate.observed?.stripes ?? [];
  if (!points.length) {
    host.appendChild(el("p", "loading", "Keine Ortsdaten verfügbar."));
    return;
  }
  const max = Math.max(1, ...points.map((point) => Math.abs(point[1])));
  stripes(host, { points, max, formatValue: (value) => `${value > 0 ? "+" : ""}${formatNumber(value, 2)} °C` });
  sourceNote(
    "local-stripes-source",
    {
      provider: "Open-Meteo auf Basis ECMWF ERA5",
      label: "Jahresmittel der Tagesmitteltemperatur",
      homepage: "https://open-meteo.com/en/docs/historical-weather-api",
    },
    `Bezug ${climate.observed.stripesReference.period}`,
  );
}

function renderLocalAnnual(climate) {
  const host = chartHost("local-chart-annual");
  const annual = climate.observed?.annual ?? [];
  if (!annual.length) {
    host.appendChild(el("p", "loading", "Keine Ortsdaten verfügbar."));
    return;
  }
  const baseline = climate.observed.baseline;
  plot(host, {
    height: 300,
    series: [
      {
        id: "annual",
        label: "Jahresmittel",
        color: PALETTE.co2,
        kind: "bars",
        points: annual,
        colorFor: (value) => divergingColor(value - baseline.value, 1.5),
        opacity: 0.9,
        digits: 1,
        unit: "°C",
      },
      {
        id: "mean",
        label: `Mittel ${baseline.period}: ${formatNumber(baseline.value, 1)} °C`,
        color: PALETTE.neutral,
        points: [
          [annual[0][0] - 1, baseline.value],
          [annual[annual.length - 1][0] + 1, baseline.value],
        ],
        width: 1.4,
        dash: "6 4",
        digits: 1,
        unit: "°C",
        interactive: false,
      },
    ],
    x: { format: (value) => String(Math.round(value)) },
    y: { digits: 0, unit: "°C" },
  });
  sourceNote(
    "local-annual-source",
    {
      provider: "Open-Meteo auf Basis ECMWF ERA5",
      label: "Jahresmittel der Tagesmitteltemperatur",
      homepage: "https://open-meteo.com/en/docs/historical-weather-api",
    },
    `vollständige Jahre ${climate.observed.coverage?.split("–")[0]}–${climate.observed.stats?.lastCompleteYear?.year ?? ""}; das laufende Jahr ${climate.observed.stats?.partialYearExcluded ?? ""} ist unvollständig und bleibt außen vor`,
  );
}

/**
 * Ganzzahlige Werteachse, deren oberste Gitterlinie über dem größten Wert liegt.
 * Ohne das schweben die obersten Punkte über der letzten Linie, ohne Bezugswert.
 */
function integerAxis(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  const maxValue = finite.length ? Math.max(...finite) : 0;
  // Sechs Prozent Luft: die obersten Punkte sollen die Feldkante nicht berühren.
  const top = Math.max(1, maxValue * 1.06);
  const candidates = niceTicks(0, top, 5);
  const step = candidates.length > 1 ? Math.max(1, Math.round(candidates[1] - candidates[0])) : 1;
  const ticks = [];
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(value);
  return { domain: [0, top], ticks };
}

function renderLocalExtremes(climate) {
  // Der Container bleibt bestehen: er hält die beiden Felder, die beim Fehlerfall nur
  // ausgeblendet werden (ein Leeren würde das Markup der Felder mitnehmen).
  const container = $("local-extremes-hosts");
  const rows = climate.extremeDays ?? [];
  const panelsInDom = [...container.querySelectorAll(".chart-panel")];
  for (const panel of panelsInDom) panel.hidden = false;
  container.querySelector(".chart-split__note")?.remove();
  const fail = () => {
    for (const panel of panelsInDom) panel.hidden = true;
    container.appendChild(el("p", "chart-split__note loading", "Keine Ortsdaten verfügbar."));
  };
  if (!rows.length) {
    fail();
    return;
  }

  // Heiße Tage und Frosttage liegen um ein Vielfaches auseinander. In Gruppenbalken
  // auf einer gemeinsamen Achse verschwanden die heißen Tage deshalb neben den
  // Frosttagen; jetzt stehen zwei Verlaufsfelder mit je eigener, bei null
  // beginnender Achse nebeneinander.
  const panels = [
    {
      key: "hot",
      label: "Tage ≥ 30 °C",
      color: PALETTE.temperature,
      decades: decadalMeans(rows.map((row) => [row[0], row[1]])),
    },
    {
      key: "frost",
      label: "Frosttage < 0 °C",
      color: PALETTE.cold,
      decades: decadalMeans(rows.map((row) => [row[0], row[3]])),
    },
  ];

  const firstDecade = panels[0].decades[0]?.[0];
  const lastDecade = panels[0].decades[panels[0].decades.length - 1]?.[0];
  if (!Number.isFinite(firstDecade) || !Number.isFinite(lastDecade)) {
    fail();
    return;
  }
  // Beschriftung nur alle 20 Jahre: in schmalen Spalten überlagern sich sonst die Jahreszahlen.
  const tickValues = panels[0].decades
    .map(([decade]) => decade)
    .filter((decade) => (decade - firstDecade) % 20 === 0);
  const formatDecade = (value) => `${Math.floor(value / 10) * 10}er`;
  const signed = (value) => `${value > 0 ? "+" : ""}${formatNumber(value, 0)}`;

  for (const panel of panels) {
    const points = panel.decades.map(([decade, value]) => [decade, value]);
    const chartNode = $(`local-chart-extremes-${panel.key}`);
    if (!chartNode) continue;
    const axis = integerAxis(points.map(([, value]) => value));
    plot(chartHost(`local-chart-extremes-${panel.key}`), {
      height: 200,
      legend: false,
      series: [
        {
          id: panel.key,
          label: panel.label,
          color: panel.color,
          kind: "dots",
          dotRadius: 3.4,
          width: 2.4,
          points,
          digits: 0,
          // Einzahl, wenn die gerundete Anzeige 1 ergibt („1 Tag“, nicht „1 Tage“).
          unit: (value) => (Math.abs(Math.round(value)) === 1 ? "Tag je Jahr" : "Tage je Jahr"),
        },
      ],
      x: { domain: [firstDecade - 4, lastDecade + 4], tickValues, format: formatDecade },
      y: { domain: axis.domain, ticks: axis.ticks, zero: true, digits: 0, unit: "Tage" },
      tooltipExtra: (active) => {
        const point = active[0]?.point;
        const base = panel.decades[0];
        if (!point || !base) return null;
        if (point[0] === base[0]) return `Bezugsdekade für den Vergleich mit späteren Jahrzehnten`;
        const difference = point[1] - base[1];
        return `${signed(difference)} ${Math.abs(Math.round(difference)) === 1 ? "Tag" : "Tage"} gegenüber dem Mittel der ${formatDecade(firstDecade)} Jahre`;
      },
    });

    const delta = $(`local-extremes-${panel.key}-delta`);
    const first = panel.decades[0];
    const last = panel.decades[panel.decades.length - 1];
    if (delta && first && last) {
      delta.textContent = `${formatNumber(first[1], 0)} → ${formatNumber(last[1], 0)} Tage · ${signed(last[1] - first[1])} seit den ${formatDecade(firstDecade)} Jahren`;
    }
  }

  const years = rows.map((row) => row[0]);
  sourceNote(
    "local-extremes-source",
    {
      provider: "Open-Meteo auf Basis ECMWF ERA5",
      label: "Tagesmaximum und Tagesminimum",
      homepage: "https://open-meteo.com/en/docs/historical-weather-api",
    },
    `10-Jahres-Mittel aus ${years.length} vollständigen Jahren (${years[0]}–${years[years.length - 1]}); Jahrzehnte mit weniger als acht Jahren bleiben außen vor.`,
  );
}

const projectionState = { key: null, requested: false };

/**
 * Die Modellläufe werden erst bei Bedarf geladen: sie sind beim Anbieter schwer
 * gewichtet, und die Seite soll das Kontingent nicht mit jedem Aufruf belasten.
 */
function setupProjection(lat, lon, climate) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  projectionState.key = key;
  projectionState.requested = false;
  const host = chartHost("local-chart-projection");
  $("local-projection-note").textContent = "";
  $("local-projection-source").textContent = "";

  const box = el("div", "placeholder");
  box.appendChild(
    el(
      "p",
      null,
      "Die Projektion bis 2050 wird aus drei regionalen Klimamodellen berechnet. Sie wird erst bei Bedarf geladen, " +
        "weil der Modellabruf rechenintensiv ist und Kontingente beim Datenanbieter verbraucht.",
    ),
  );
  const button = el("button", "button button--ghost", "Projektion berechnen");
  button.type = "button";
  button.addEventListener("click", () => requestProjection(lat, lon, climate, key));
  box.appendChild(button);
  host.appendChild(box);

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        requestProjection(lat, lon, climate, key);
      },
      { rootMargin: "250px" },
    );
    observer.observe(host);
  }
}

async function requestProjection(lat, lon, climate, key) {
  if (projectionState.requested || projectionState.key !== key) return;
  projectionState.requested = true;
  const host = chartHost("local-chart-projection");
  host.appendChild(el("p", "loading", "Modellläufe werden abgerufen – das kann einige Sekunden dauern …"));

  try {
    const response = await fetch(`/api/local/projection?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projection = await response.json();
    if (projectionState.key !== key) return;
    if (projection.error || !projection.ensemble?.length) {
      throw new Error(projection.error ?? "keine Modelldaten erhalten");
    }
    renderLocalProjection(climate, projection);
  } catch (error) {
    projectionState.requested = false;
    const retryHost = chartHost("local-chart-projection");
    const box = el("div", "placeholder");
    box.appendChild(
      el(
        "p",
        "error",
        `Projektionsdaten konnten nicht geladen werden: ${error.message}. Der Datenanbieter begrenzt Modellabrufe pro Stunde; ` +
          "ein erneuter Versuch ist deshalb oft erst später erfolgreich.",
      ),
    );
    const retry = el("button", "button button--ghost", "Erneut versuchen");
    retry.type = "button";
    retry.addEventListener("click", () => requestProjection(lat, lon, climate, key));
    box.appendChild(retry);
    retryHost.appendChild(box);
  }
}

function renderLocalProjection(climate, projection) {
  const host = chartHost("local-chart-projection");
  if (!projection || projection.error || !projection.ensemble?.length) {
    host.appendChild(el("p", "error", "Projektionsdaten derzeit nicht verfügbar."));
    return;
  }
  const observed = climate.observed?.annual ?? [];
  const band = projection.ensemble.map((row) => [row[0], row[2], row[3]]);
  const mean = projection.ensemble.map((row) => [row[0], row[1]]);
  plot(host, {
    height: 300,
    series: [
      { id: "band", label: `Modellspanne (${projection.models.length} Modelle)`, color: PALETTE.projection, kind: "band", points: band, opacity: 0.18 },
      {
        id: "projection",
        label: "Projektion, Modellmittel",
        color: PALETTE.projection,
        points: mean,
        width: 1.8,
        dash: "6 3",
        digits: 1,
        unit: "°C",
      },
      { id: "observed", label: "Beobachtung (ERA5)", color: PALETTE.co2, points: observed, width: 1.6, digits: 1, unit: "°C" },
    ],
    x: { domain: [observed.length ? observed[0][0] : 1950, 2051], format: (value) => String(Math.round(value)) },
    y: { digits: 0, unit: "°C" },
    guides: [{ x: new Date().getUTCFullYear(), label: "heute", color: PALETTE.axis }],
  });

  sourceNote(
    "local-projection-source",
    {
      provider: "Open-Meteo Climate API (HighResMIP / CMIP6)",
      label: projection.models.join(", "),
      homepage: "https://open-meteo.com/en/docs/climate-api",
    },
    `${projection.horizon}, Modelle einzeln ausgewertet`,
  );
  $("local-projection-note").textContent = projection.note ?? "";
}

function renderLocalCurrent(current) {
  const host = $("local-current");
  clear(host);
  host.appendChild(el("h3", null, "Aktuelle Bedingungen und Vorhersage"));
  if (!current?.current) {
    host.appendChild(el("p", "loading", "Wetterdaten derzeit nicht verfügbar."));
    return;
  }
  const list = el("dl", "stat-list");
  const add = (term, value) => {
    list.appendChild(el("dt", null, term));
    list.appendChild(el("dd", null, value));
  };
  add("Temperatur", formatUnit(current.current.temperature, 1, "°C"));
  add("Gefühlte Temperatur", formatUnit(current.current.apparent, 1, "°C"));
  add("Relative Luftfeuchte", formatUnit(current.current.humidity, 0, "%"));
  add("Windgeschwindigkeit", formatUnit(current.current.windSpeed, 0, "km/h"));
  if (current.air) {
    add("Feinstaub PM2,5", formatUnit(current.air.pm25, 1, "µg/m³"));
    add("Feinstaub PM10", formatUnit(current.air.pm10, 1, "µg/m³"));
    const aqi = current.air.europeanAqi;
    add("Europäischer Luftqualitätsindex", `${formatNumber(aqi, 0)} (${AQI_LABELS.find(([limit]) => aqi <= limit)?.[1] ?? "unbekannt"})`);
  }
  host.appendChild(list);

  const forecast = el("div", "forecast");
  for (const day of current.daily ?? []) {
    const item = el("div", "forecast__day");
    item.append(
      el("span", "forecast__date", formatDate(day.date)),
      el("strong", null, `${formatNumber(day.min, 0)} / ${formatNumber(day.max, 0)} °C`),
      el("span", "forecast__precip", `${formatNumber(day.precipitation, 1)} mm`),
    );
    forecast.appendChild(item);
  }
  host.appendChild(forecast);
}

/* ------------------------------------------------------------------ */
/* Ortsauswahl                                                         */
/* ------------------------------------------------------------------ */

function setupLocalForm() {
  const form = $("local-form");
  const input = $("local-query");
  const suggestions = $("local-suggestions");
  let timer = null;

  const closeSuggestions = () => {
    suggestions.hidden = true;
    clear(suggestions);
  };

  const showSuggestions = (results) => {
    clear(suggestions);
    if (!results.length) {
      closeSuggestions();
      return;
    }
    for (const result of results) {
      const item = document.createElement("li");
      const button = el("button", "suggestion", `${result.name}${result.admin1 ? `, ${result.admin1}` : ""}${result.country ? ` (${result.country})` : ""}`);
      button.type = "button";
      button.addEventListener("click", () => {
        input.value = result.name;
        closeSuggestions();
        loadLocal(result.latitude, result.longitude, `${result.name}${result.country ? `, ${result.country}` : ""}`);
      });
      item.appendChild(button);
      suggestions.appendChild(item);
    }
    suggestions.hidden = false;
  };

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      closeSuggestions();
      return;
    }
    timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        showSuggestions(data.results ?? []);
      } catch {
        closeSuggestions();
      }
    }, 250);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2) return;
    setLocalStatus("Ort wird gesucht …");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const first = data.results?.[0];
      if (!first) {
        setLocalStatus("Kein Ort gefunden. Bitte Schreibweise prüfen oder Koordinaten direkt verwenden.", "error");
        return;
      }
      closeSuggestions();
      loadLocal(first.latitude, first.longitude, `${first.name}${first.country ? `, ${first.country}` : ""}`);
    } catch (error) {
      setLocalStatus(`Ortssuche fehlgeschlagen: ${error.message}`, "error");
    }
  });

  $("local-geolocate").addEventListener("click", () => {
    if (!navigator.geolocation) {
      setLocalStatus("Der Browser unterstützt keine Standortbestimmung. Bitte Ort suchen.", "error");
      return;
    }
    setLocalStatus("Standort wird abgefragt …");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        loadLocal(latitude, longitude, `Ihr Standort (${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°)`);
      },
      (error) => setLocalStatus(`Standort nicht verfügbar: ${error.message}. Bitte Ort suchen.`, "error"),
      { timeout: 10000, maximumAge: 600000 },
    );
  });

  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) closeSuggestions();
  });

  const params = new URLSearchParams(window.location.search);
  const lat = Number.parseFloat(params.get("lat") ?? "");
  const lon = Number.parseFloat(params.get("lon") ?? "");
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    input.value = params.get("ort") ?? "";
    loadLocal(lat, lon, params.get("ort") ?? `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`);
  } else {
    input.value = "Berlin";
    loadLocal(52.52, 13.41, "Berlin, Deutschland");
  }
}

/* ------------------------------------------------------------------ */
/* Start                                                              */
/* ------------------------------------------------------------------ */

function setupControls() {
  for (const name of Object.keys(CONTROL_DEFS)) renderControls(name);
}

function init() {
  applyStaticContent();
  renderEvidence();
  renderLimitations();
  renderExternalSources();
  renderMitigation();
  renderForcing();
  renderCumulativeBar();
  renderPerCapitaChart();
  setupControls();
  setupLocalForm();
  $("budget-form").addEventListener("change", renderBudget);
  renderBudget();
  loadIndicators();
}

init();
