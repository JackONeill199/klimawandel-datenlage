/**
 * Abhängigkeitsfreies SVG-Diagrammmodul.
 * Unterstützt Linien, Flächen, Balken, Bänder (Unsicherheitsspannen),
 * Referenzlinien, Markierungen, Legende mit Umschalten und Hover-Ablesung.
 */

const NS = "http://www.w3.org/2000/svg";

export const PALETTE = {
  co2: "#e08a3c",
  co2Seasonal: "#f2c078",
  temperature: "#dc5b57",
  warm: "#dc5b57",
  cold: "#4d8fd6",
  methane: "#c9a23f",
  nitrousOxide: "#7fb2a4",
  seaIce: "#5fc6de",
  seaLevel: "#8ea2f0",
  local: "#c8873f",
  projection: "#dc5b57",
  neutral: "#8b95a1",
  grid: "rgba(233, 238, 245, 0.09)",
  axis: "rgba(233, 238, 245, 0.35)",
};

const DIVERGING = {
  cold: [77, 143, 214],
  neutral: [226, 230, 236],
  warm: [220, 91, 87],
};

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

const numberFormat = (digits) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return numberFormat(digits).format(value);
}

/** Achsen-Schrittweite nach „nice numbers“. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const range = max - min;
  const rawStep = range / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const candidates = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude);
  const step = candidates.find((candidate) => candidate >= rawStep) ?? candidates[candidates.length - 1];
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + step / 1000; value += step) {
    ticks.push(Math.round(value / step) * step);
  }
  return ticks;
}

/** Divergierende Farbskala für Temperaturanomalien. */
export function divergingColor(value, max = 1) {
  const clamped = Math.max(-1, Math.min(1, value / max));
  const [from, to] = clamped >= 0 ? [DIVERGING.neutral, DIVERGING.warm] : [DIVERGING.cold, DIVERGING.neutral];
  const t = Math.abs(clamped);
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function colorWithOpacity(color, opacity) {
  if (opacity === undefined || opacity >= 1) return color;
  if (color.startsWith("#")) {
    const value = color.slice(1);
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

/**
 * Wertebereich EINER Komponente (0 = x, 1 = y, 2 = obere Spanne).
 * Mehrere Indizes einzubeziehen würde x- und y-Werte vermischen.
 */
function extent(points, component = 1) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point[component];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

/** Nächstgelegenen Punkt zu einem x-Wert finden (Punkte sind sortiert). */
function nearestPoint(points, x) {
  if (!points?.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid][0] < x) low = mid;
    else high = mid;
  }
  return Math.abs(points[low][0] - x) <= Math.abs(points[high][0] - x) ? points[low] : points[high];
}

/**
 * Zeichnet ein Diagramm in `host`.
 * Rückgabe: { update(config), destroy() }.
 */
export function plot(host, config) {
  let current = normalize(config);
  const hidden = new Set();
  const state = { width: 0, height: 0, geometry: null };

  host.classList.add("chart");
  const svg = el("svg", { class: "chart-svg", role: "img" });
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tip";
  tooltip.hidden = true;
  host.appendChild(svg);
  host.appendChild(tooltip);

  const legendHost = document.createElement("div");
  legendHost.className = "chart-legend";
  if (current.legend !== false) host.appendChild(legendHost);

  function normalize(next) {
    const cfg = { height: 300, legend: true, ...next };
    cfg.series = (cfg.series ?? []).map((series) => ({
      kind: "line",
      width: 1.8,
      opacity: 1,
      ...series,
      points: (series.points ?? []).filter((point) => Number.isFinite(point[0])),
    }));
    return cfg;
  }

  function drawLegend() {
    legendHost.textContent = "";
    for (const series of current.series) {
      if (series.legend === false || !series.label) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "legend-item";
      button.setAttribute("aria-pressed", String(!hidden.has(series.id)));
      button.classList.toggle("is-off", hidden.has(series.id));
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = series.kind === "band" ? colorWithOpacity(series.color, 0.35) : series.color;
      if (series.dash) swatch.style.backgroundImage = `linear-gradient(90deg, ${series.color} 60%, transparent 60%)`;
      const label = document.createElement("span");
      label.textContent = series.label;
      button.append(swatch, label);
      button.addEventListener("click", () => {
        if (hidden.has(series.id)) hidden.delete(series.id);
        else hidden.add(series.id);
        draw();
      });
      legendHost.appendChild(button);
    }
    legendHost.hidden = legendHost.childElementCount === 0;
  }

  function computeGeometry(width) {
    const padding = { top: 18, right: current.y2 ? 58 : 20, bottom: 34, left: current.y?.width ?? 58 };
    const innerWidth = Math.max(80, width - padding.left - padding.right);
    const innerHeight = Math.max(60, current.height - padding.top - padding.bottom);

    const visible = current.series.filter((series) => !hidden.has(series.id));
    const allPoints = visible.flatMap((series) => series.points);
    const xDomain =
      current.x?.domain ??
      (() => {
        const [min, max] = extent(allPoints.map((point) => point.slice(0, 2)), 0);
        return [min, max];
      })();
    let yDomain =
      current.y?.domain ??
      (() => {
        // Bei Bändern gehört auch die obere Spanne (Index 2) zum Wertebereich.
        const values = [];
        for (const series of visible) {
          for (const point of series.points) {
            values.push(point[1]);
            if (series.kind === "band") values.push(point[2]);
          }
        }
        const finite = values.filter((value) => Number.isFinite(value));
        if (!finite.length) return [0, 1];
        const min = Math.min(...finite);
        const max = Math.max(...finite);
        if (min === max) return [min - 1, max + 1];
        const paddingFactor = (max - min) * 0.08;
        const lower = current.y?.zero ? Math.min(0, min) : min - paddingFactor;
        const upper = max + paddingFactor;
        return [lower, upper];
      })();

    const scaleX = (value) =>
      padding.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * innerWidth;
    const scaleY = (value) =>
      padding.top + innerHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * innerHeight;

    let y2Domain = null;
    let scaleY2 = null;
    if (current.y2) {
      const second = visible.filter((series) => series.yAxis === 2);
      if (second.length) {
        const [min, max] = extent(second.flatMap((series) => series.points), 1);
        y2Domain = current.y2.domain ?? [min - (max - min) * 0.1, max + (max - min) * 0.1 || max + 1];
        scaleY2 = (value) => padding.top + innerHeight - ((value - y2Domain[0]) / (y2Domain[1] - y2Domain[0] || 1)) * innerHeight;
      }
    }
    return { padding, innerWidth, innerHeight, xDomain, yDomain, y2Domain, scaleX, scaleY, scaleY2 };
  }

  function buildPath(points, geometry, component = 1, yScale = geometry.scaleY) {
    let path = "";
    for (const point of points) {
      const value = point[component];
      if (!Number.isFinite(value)) continue;
      const x = geometry.scaleX(point[0]);
      const y = yScale(value);
      path += path ? ` L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return path;
  }

  function draw() {
    const width = Math.max(320, Math.floor(host.clientWidth || 640));
    state.width = width;
    const geometry = computeGeometry(width);
    state.geometry = geometry;
    const { padding, innerHeight, innerWidth, xDomain, yDomain, scaleX, scaleY } = geometry;

    svg.setAttribute("viewBox", `0 0 ${width} ${current.height}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(current.height));
    svg.textContent = "";

    const defs = el("defs");
    svg.appendChild(defs);

    // Horizontale Bänder (z. B. Referenzperioden)
    for (const band of current.bands ?? []) {
      const x1 = scaleX(band.from);
      const x2 = scaleX(band.to);
      svg.appendChild(
        el("rect", {
          x: Math.min(x1, x2),
          y: padding.top,
          width: Math.abs(x2 - x1),
          height: innerHeight,
          fill: colorWithOpacity(band.color ?? "#ffffff", band.opacity ?? 0.06),
        }),
      );
      if (band.label) {
        svg.appendChild(
          el(
            "text",
            { x: (x1 + x2) / 2, y: padding.top + 12, class: "chart-band-label", "text-anchor": "middle" },
            band.label,
          ),
        );
      }
    }

    // Gitter und y-Achse
    const yTicks = current.y?.ticks ?? niceTicks(yDomain[0], yDomain[1], current.y?.tickCount ?? 5);
    for (const tick of yTicks) {
      const y = scaleY(tick);
      if (y < padding.top - 1 || y > padding.top + innerHeight + 1) continue;
      svg.appendChild(
        el("line", { x1: padding.left, x2: padding.left + innerWidth, y1: y, y2: y, class: "chart-grid" }),
      );
      svg.appendChild(
        el(
          "text",
          { x: padding.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" },
          (current.y?.format ?? ((value) => formatNumber(value, current.y?.digits ?? 1)))(tick),
        ),
      );
    }
    if (current.y?.zero) {
      const zeroY = scaleY(0);
      if (zeroY >= padding.top && zeroY <= padding.top + innerHeight) {
        svg.appendChild(
          el("line", {
            x1: padding.left,
            x2: padding.left + innerWidth,
            y1: zeroY,
            y2: zeroY,
            class: "chart-zero",
          }),
        );
      }
    }

    // Zweite y-Achse
    if (geometry.scaleY2 && current.y2) {
      const ticks = current.y2.ticks ?? niceTicks(geometry.y2Domain[0], geometry.y2Domain[1], 4);
      for (const tick of ticks) {
        const y = geometry.scaleY2(tick);
        if (y < padding.top - 1 || y > padding.top + innerHeight + 1) continue;
        svg.appendChild(
          el(
            "text",
            { x: padding.left + innerWidth + 8, y: y + 4, class: "chart-axis-label chart-axis-label--right" },
            (current.y2.format ?? ((value) => formatNumber(value, 1)))(tick),
          ),
        );
      }
    }

    // Horizontale Referenzlinien im Diagrammfeld
    for (const guide of current.yGuides ?? []) {
      const y = scaleY(guide.y);
      if (y < padding.top - 1 || y > padding.top + innerHeight + 1) continue;
      svg.appendChild(
        el("line", {
          x1: padding.left,
          x2: padding.left + innerWidth,
          y1: y,
          y2: y,
          class: "chart-guide",
          stroke: guide.color ?? PALETTE.axis,
          "stroke-dasharray": guide.dash ?? "4 4",
        }),
      );
      if (guide.label) {
        const label = el(
          "text",
          {
            x: padding.left + 6,
            y: y - 5,
            class: "chart-guide-label",
            fill: guide.color ?? PALETTE.neutral,
          },
          guide.label,
        );
        svg.appendChild(label);
      }
    }

    // x-Achse
    const xTicks = current.x?.tickValues ?? niceTicks(xDomain[0], xDomain[1], current.x?.tickCount ?? 6);
    for (const tick of xTicks) {
      const x = scaleX(tick);
      if (x < padding.left - 1 || x > padding.left + innerWidth + 1) continue;
      svg.appendChild(
        el("line", { x1: x, x2: x, y1: padding.top + innerHeight, y2: padding.top + innerHeight + 4, class: "chart-axis" }),
      );
      svg.appendChild(
        el(
          "text",
          {
            x,
            y: padding.top + innerHeight + 18,
            class: "chart-axis-label",
            "text-anchor": "middle",
          },
          (current.x?.format ?? ((value) => String(value)))(tick),
        ),
      );
    }

    // Vertikale Referenzlinien
    for (const guide of current.guides ?? []) {
      const x = scaleX(guide.x);
      if (x < padding.left || x > padding.left + innerWidth) continue;
      svg.appendChild(
        el("line", {
          x1: x,
          x2: x,
          y1: padding.top,
          y2: padding.top + innerHeight,
          class: "chart-guide",
          stroke: guide.color ?? PALETTE.axis,
          "stroke-dasharray": guide.dash ?? "3 3",
        }),
      );
      if (guide.label) {
        svg.appendChild(
          el(
            "text",
            {
              x: x + 4,
              y: padding.top + 12 + (guide.offset ?? 0),
              class: "chart-guide-label",
              fill: guide.color ?? PALETTE.neutral,
            },
            guide.label,
          ),
        );
      }
    }

    // Serien
    for (const series of current.series) {
      if (hidden.has(series.id)) continue;
      const scale = series.yAxis === 2 && geometry.scaleY2 ? geometry.scaleY2 : scaleY;
      const points = series.points;

      if (series.kind === "band") {
        const upper = points
          .filter((point) => Number.isFinite(point[2]))
          .map((point) => `L ${scaleX(point[0]).toFixed(2)} ${scale(point[2]).toFixed(2)}`);
        const lower = points
          .filter((point) => Number.isFinite(point[1]))
          .map((point) => [scaleX(point[0]), scale(point[1])])
          .reverse();
        if (upper.length && lower.length) {
          const lowerPath = lower.map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
          const d = `M ${scaleX(points[0][0]).toFixed(2)} ${scale(points[0][2]).toFixed(2)} ${upper.slice(1).join(" ")} ${lowerPath} Z`;
          svg.appendChild(el("path", { d, fill: colorWithOpacity(series.color, series.opacity ?? 0.2), stroke: "none" }));
        }
        continue;
      }

      if (series.kind === "bars") {
        const steps = points.map((point) => point[0]);
        const stepWidth = steps.length > 1 ? (steps[1] - steps[0]) : 1;
        const barWidth = Math.max(1, Math.min(18, (stepWidth / (xDomain[1] - xDomain[0])) * innerWidth * 0.72));
        const zero = scale(current.bars?.zero ?? 0);
        for (const point of points) {
          const value = point[1];
          if (!Number.isFinite(value)) continue;
          const x = scaleX(point[0]) - barWidth / 2;
          const y = scale(value);
          const color = series.palette && point.length > 2
            ? series.palette[point[2] % series.palette.length]
            : series.colorFor
              ? series.colorFor(value, point[0])
              : series.color;
          svg.appendChild(
            el("rect", {
              x,
              y: Math.min(y, zero),
              width: barWidth,
              height: Math.max(0.8, Math.abs(y - zero)),
              fill: colorWithOpacity(color, series.opacity ?? 0.85),
              rx: barWidth > 3 ? 1 : 0,
            }),
          );
        }
        continue;
      }

      if (series.kind === "area") {
        const baseline = series.areaFrom ?? yDomain[0];
        const line = buildPath(points, geometry, 1, scale);
        if (line) {
          const first = points[0][0];
          const last = points[points.length - 1][0];
          const d = `${line} L ${scaleX(last).toFixed(2)} ${scale(baseline).toFixed(2)} L ${scaleX(first).toFixed(2)} ${scale(baseline).toFixed(2)} Z`;
          svg.appendChild(el("path", { d, fill: colorWithOpacity(series.color, series.opacity ?? 0.16), stroke: "none" }));
        }
      }

      const d = buildPath(points, geometry, 1, scale);
      if (d) {
        svg.appendChild(
          el("path", {
            d,
            fill: "none",
            stroke: series.color,
            "stroke-width": series.width,
            "stroke-dasharray": series.dash ?? null,
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            opacity: series.opacity ?? 1,
          }),
        );
      }

      if (series.kind === "dots") {
        for (const point of points) {
          if (!Number.isFinite(point[1])) continue;
          svg.appendChild(el("circle", { cx: scaleX(point[0]), cy: scale(point[1]), r: 2.2, fill: series.color }));
        }
      }
    }

    // Markierungen (z. B. letzter Messwert)
    for (const marker of current.markers ?? []) {
      if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) continue;
      const x = scaleX(marker.x);
      const y = scaleY(marker.y);
      svg.appendChild(el("circle", { cx: x, cy: y, r: 3.4, fill: marker.color ?? PALETTE.neutral, stroke: "#0b0e12", "stroke-width": 1.2 }));
      if (marker.label) {
        svg.appendChild(
          el(
            "text",
            {
              x: x - 6,
              y: y - 8,
              class: "chart-marker-label",
              "text-anchor": "end",
              fill: marker.color ?? PALETTE.neutral,
            },
            marker.label,
          ),
        );
      }
    }

    // Interaktionsfläche
    const overlay = el("rect", {
      x: padding.left,
      y: padding.top,
      width: innerWidth,
      height: innerHeight,
      fill: "transparent",
      class: "chart-overlay",
    });
    const crosshair = el("line", { class: "chart-crosshair", y1: padding.top, y2: padding.top + innerHeight, opacity: 0 });
    const highlight = el("g", { class: "chart-highlight" });
    svg.appendChild(crosshair);
    svg.appendChild(highlight);
    svg.appendChild(overlay);

    let activePoints = [];
    const showAt = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const relative = ((clientX - rect.left) / rect.width) * width;
      const xValue = xDomain[0] + ((relative - padding.left) / innerWidth) * (xDomain[1] - xDomain[0]);
      if (relative < padding.left - 2 || relative > padding.left + innerWidth + 2) {
        hideTip();
        return;
      }
      const x = scaleX(xValue);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("opacity", "0.5");
      highlight.textContent = "";
      activePoints = [];
      for (const series of current.series) {
        if (hidden.has(series.id) || series.kind === "band" || series.interactive === false) continue;
        const point = nearestPoint(series.points, xValue);
        if (!point) continue;
        const scale = series.yAxis === 2 && geometry.scaleY2 ? geometry.scaleY2 : scaleY;
        const pointX = scaleX(point[0]);
        const pointY = scale(point[1]);
        if (pointY < padding.top - 2 || pointY > padding.top + innerHeight + 2) continue;
        highlight.appendChild(
          el("circle", {
            cx: pointX,
            cy: pointY,
            r: 3,
            fill: series.color,
            stroke: "#0b0e12",
            "stroke-width": 1.2,
          }),
        );
        activePoints.push({ series, point });
      }
      if (!activePoints.length) {
        hideTip();
        return;
      }
      const anchorX = activePoints[0].point[0];
      renderTip(anchorX, clientX, rect, width);
    };

    function renderTip(xValue, clientX, rect, width) {
      const rows = activePoints.map(({ series, point }) => {
        const digits = series.digits ?? current.y?.digits ?? 1;
        const unit = series.unit ?? current.y?.unit ?? "";
        const value = point.length > 2 && series.valueComponent ? point[series.valueComponent] : point[1];
        return { label: series.label, color: series.color, value: `${formatNumber(value, digits)}${unit ? ` ${unit}` : ""}` };
      });
      const title = (current.x?.format ?? ((value) => String(value)))(xValue);
      const extra = current.tooltipExtra ? current.tooltipExtra(activePoints) : null;
      tooltip.textContent = "";
      const titleNode = document.createElement("div");
      titleNode.className = "chart-tip-title";
      titleNode.textContent = title;
      tooltip.appendChild(titleNode);
      for (const row of rows) {
        const line = document.createElement("div");
        line.className = "chart-tip-row";
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = row.color;
        const label = document.createElement("span");
        label.textContent = row.label ?? "";
        const valueNode = document.createElement("strong");
        valueNode.textContent = row.value;
        line.append(swatch, label, valueNode);
        tooltip.appendChild(line);
      }
      if (extra) {
        const note = document.createElement("div");
        note.className = "chart-tip-note";
        note.textContent = extra;
        tooltip.appendChild(note);
      }
      tooltip.hidden = false;
      const tooltipWidth = tooltip.offsetWidth || 180;
      const relativeX = ((xValue - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth + padding.left;
      const pixelX = (relativeX / width) * rect.width;
      const left = Math.min(Math.max(8, pixelX + 14), rect.width - tooltipWidth - 8);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${padding.top + 6}px`;
    }

    function hideTip() {
      tooltip.hidden = true;
      crosshair.setAttribute("opacity", "0");
      highlight.textContent = "";
      activePoints = [];
    }

    overlay.addEventListener("pointermove", (event) => showAt(event.clientX));
    overlay.addEventListener("pointerdown", (event) => showAt(event.clientX));
    overlay.addEventListener("pointerleave", hideTip);
    svg.addEventListener("pointerleave", hideTip);
  }

  drawLegend();
  draw();

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (Math.abs((host.clientWidth || 0) - state.width) < 8) return;
          draw();
        })
      : null;
  observer?.observe(host);

  return {
    update(next) {
      current = normalize({ ...current, ...next });
      hidden.clear();
      drawLegend();
      draw();
    },
    destroy() {
      observer?.disconnect();
      host.textContent = "";
    },
  };
}

/**
 * „Warming Stripes“: Jahresanomalien als Farbstreifen, mit Jahresachse und Hover-Wert.
 */
export function stripes(host, { points, max = 2, formatValue = (value) => `${formatNumber(value, 1)} °C` }) {
  host.classList.add("chart", "chart--stripes");
  const svg = el("svg", { class: "stripes-svg", role: "img" });
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tip";
  tooltip.hidden = true;
  host.append(svg, tooltip);

  const draw = () => {
    const width = Math.max(320, Math.floor(host.clientWidth || 640));
    const height = 110;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(height));
    svg.textContent = "";
    const padding = { left: 0, right: 0, top: 0, bottom: 18 };
    const innerWidth = width;
    const barWidth = innerWidth / points.length;
    const innerHeight = height - padding.bottom;
    points.forEach((point, index) => {
      const [year, value] = point;
      const rect = el("rect", {
        x: index * barWidth,
        y: 0,
        width: Math.max(1, barWidth + 0.5),
        height: innerHeight,
        fill: divergingColor(value, max),
      });
      rect.dataset.year = String(year);
      rect.dataset.value = String(value);
      svg.appendChild(rect);
    });
    for (let index = 0; index < points.length; index += 1) {
      const year = points[index][0];
      if (year % 20 !== 0) continue;
      svg.appendChild(
        el(
          "text",
          { x: index * barWidth + 1, y: height - 4, class: "chart-axis-label", "text-anchor": "middle" },
          String(year),
        ),
      );
    }
    svg.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      const index = Math.max(0, Math.min(points.length - 1, Math.floor(((event.clientX - rect.left) / rect.width) * points.length)));
      const [year, value] = points[index];
      tooltip.textContent = "";
      const title = document.createElement("div");
      title.className = "chart-tip-title";
      title.textContent = String(year);
      const row = document.createElement("div");
      row.className = "chart-tip-row";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = divergingColor(value, max);
      const valueNode = document.createElement("strong");
      valueNode.textContent = formatValue(value);
      row.append(swatch, valueNode);
      tooltip.append(title, row);
      tooltip.hidden = false;
      const tooltipWidth = tooltip.offsetWidth || 140;
      tooltip.style.left = `${Math.min(Math.max(4, ((index + 0.5) / points.length) * rect.width - tooltipWidth / 2), rect.width - tooltipWidth - 4)}px`;
      tooltip.style.top = "0px";
    });
    svg.addEventListener("pointerleave", () => {
      tooltip.hidden = true;
    });
  };

  draw();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  observer?.observe(host);
  return { destroy: () => { observer?.disconnect(); host.textContent = ""; } };
}
