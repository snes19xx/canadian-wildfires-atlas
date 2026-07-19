import * as d3 from "d3";
import { colors, cssv } from "./theme.js";

const MONO = "IBM Plex Mono, monospace";
const SANS = "IBM Plex Sans, sans-serif";
const fmt = d3.format(",");

const tip = () => document.getElementById("tooltip");

export function showTip(html, x, y) {
  const el = tip();
  el.innerHTML = html;
  el.style.display = "block";
  const pad = 14;
  let tx = x + pad,
    ty = y + pad;
  const r = el.getBoundingClientRect();
  if (tx + r.width > innerWidth - 8) tx = x - r.width - pad;
  if (ty + r.height > innerHeight - 8) ty = y - r.height - pad;
  el.style.left = tx + "px";
  el.style.top = ty + "px";
}

export function hideTip() {
  tip().style.display = "none";
}

export function drawTrackSpark(svgEl, values, highlight) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  const w = 100,
    h = 42;
  svg.attr("viewBox", `0 0 ${w} ${h}`);
  const x = d3.scaleLinear([0, values.length], [0, w]);
  const y = d3.scaleLinear([0, d3.max(values)], [h - 1, 3]);
  svg
    .selectAll("rect")
    .data(values)
    .join("rect")
    .attr("x", (d, i) => x(i))
    .attr("width", Math.max(0.3, (w / values.length) * 0.72))
    .attr("y", (d) => y(d))
    .attr("height", (d) => h - 1 - y(d))
    .attr("fill", (d, i) =>
      i === highlight ? cssv("--ember-2") : cssv("--faint"),
    )
    .attr("opacity", 0.85);
  svg
    .append("line")
    .attr("x1", 0)
    .attr("x2", w)
    .attr("y1", h - 0.5)
    .attr("y2", h - 0.5)
    .attr("stroke", cssv("--rule"))
    .attr("stroke-width", 1);
}

function axisText(sel, size = 11) {
  return sel
    .attr("font-family", MONO)
    .attr("font-size", size)
    .attr("fill", cssv("--muted"));
}

// Panel-colored casing so annotations stay legible over bars.
function halo(sel) {
  return sel
    .attr("stroke", cssv("--panel"))
    .attr("stroke-width", 3.5)
    .attr("stroke-linejoin", "round")
    .attr("paint-order", "stroke");
}

function figAnnual(annual, onYearClick) {
  const years = annual.years;
  const mha = annual.nfdb.ha.map((h) => h / 1e6);
  const nbacByYear = new Map(
    annual.nbac.years.map((y, i) => [y, annual.nbac.ha_adj[i] / 1e6]),
  );
  const svg = d3.select("#fig-annual svg");
  svg.selectAll("*").remove();
  const W = 872,
    H = 300,
    m = { t: 18, r: 12, b: 26, l: 34 };
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleBand(years, [m.l, W - m.r]).paddingInner(0.22);
  const y = d3.scaleLinear([0, 18], [H - m.b, m.t]);

  svg
    .append("g")
    .selectAll("line")
    .data(y.ticks(4))
    .join("line")
    .attr("x1", m.l)
    .attr("x2", W - m.r)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d))
    .attr("stroke", cssv("--rule"));
  axisText(svg.append("g").selectAll("text").data(y.ticks(4)).join("text"))
    .attr("x", m.l - 8)
    .attr("y", (d) => y(d) + 3.5)
    .attr("text-anchor", "end")
    .text((d) => d);
  axisText(svg.append("text"), 10)
    .attr("x", m.l - 8)
    .attr("y", m.t - 6)
    .attr("text-anchor", "end")
    .attr("fill", cssv("--faint"))
    .text("Mha");
  axisText(
    svg
      .append("g")
      .selectAll("text")
      .data([1960, 1980, 2000, 2023])
      .join("text"),
  )
    .attr("x", (d) => x(d) + x.bandwidth() / 2)
    .attr("y", H - 8)
    .attr("text-anchor", "middle")
    .text((d) => d);

  svg
    .append("g")
    .selectAll("path")
    .data(years)
    .join("path")
    .attr("d", (d, i) => {
      const v = mha[i],
        bx = x(d),
        bw = x.bandwidth();
      const by = y(v),
        bh = Math.max(0.5, H - m.b - by),
        rr = Math.min(2.5, bw / 2, bh);
      return `M${bx},${by + rr} a${rr},${rr} 0 0 1 ${rr},-${rr} h${bw - 2 * rr}
              a${rr},${rr} 0 0 1 ${rr},${rr} v${bh - rr} h${-bw} Z`;
    })
    .attr("fill", cssv("--ember-2"))
    .style("cursor", "pointer");

  const median = d3.median(mha);
  svg
    .append("line")
    .attr("x1", m.l)
    .attr("x2", W - m.r)
    .attr("y1", y(median))
    .attr("y2", y(median))
    .attr("stroke", cssv("--muted"))
    .attr("stroke-dasharray", "3 4");
  const labelText = `median ${median.toFixed(1)}`;
  const labelEnd = m.l + 6 + labelText.length * 6.3;
  const under = mha.filter((_, i) => x(years[i]) < labelEnd);
  halo(axisText(svg.append("text"), 10.5))
    .attr("x", m.l + 6)
    .attr("y", Math.min(y(median), y(d3.max(under))) - 5)
    .text(labelText);

  for (const yr of [1989, 2023, 2025]) {
    const v = mha[yr - years[0]];
    halo(svg.append("text"))
      .attr("x", x(yr) + (yr === 2025 ? x.bandwidth() : x.bandwidth() / 2))
      .attr("y", y(v) - 7)
      .attr("text-anchor", yr === 2025 ? "end" : "middle")
      .attr("font-family", MONO)
      .attr("font-size", 11.5)
      .attr("fill", cssv("--ink"))
      .text(`${yr}, ${v.toFixed(1)}`);
  }

  const hoverBand = svg
    .append("rect")
    .attr("fill", cssv("--ink"))
    .attr("opacity", 0)
    .attr("y", m.t)
    .attr("height", H - m.t - m.b)
    .attr("width", x.step());
  const yearAt = (mx) =>
    years[
      Math.max(0, Math.min(years.length - 1, Math.floor((mx - m.l) / x.step())))
    ];
  svg
    .append("rect")
    .attr("x", m.l)
    .attr("y", m.t)
    .attr("width", W - m.l - m.r)
    .attr("height", H - m.t - m.b)
    .attr("fill", "transparent")
    .on("pointermove", (ev) => {
      const yr = yearAt(d3.pointer(ev)[0]);
      const i = yr - years[0];
      hoverBand.attr("x", x(yr) - x.step() * 0.14).attr("opacity", 0.06);
      const nbac = nbacByYear.has(yr)
        ? `<br/><span class="t-muted">NBAC adj ${nbacByYear.get(yr).toFixed(2)} Mha</span>`
        : "";
      showTip(
        `<b>${yr}</b><br/>${mha[i].toFixed(2)} Mha · ${fmt(annual.nfdb.fires[i])} large fires${nbac}`,
        ev.clientX,
        ev.clientY,
      );
    })
    .on("pointerleave", () => {
      hoverBand.attr("opacity", 0);
      hideTip();
    })
    .on("click", (ev) => onYearClick(yearAt(d3.pointer(ev)[0])));
}

function figSize(annual) {
  const eras = Object.entries(annual.era_mean_size);
  const svg = d3.select("#fig-size svg");
  svg.selectAll("*").remove();
  const W = 872,
    H = 240,
    m = { t: 24, r: 12, b: 30, l: 12 };
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3
    .scaleBand(
      eras.map((e) => e[0]),
      [m.l, W - m.r],
    )
    .paddingInner(0.35);
  const y = d3.scaleLinear([0, 11000], [H - m.b, m.t]);

  svg
    .append("g")
    .selectAll("path")
    .data(eras)
    .join("path")
    .attr("d", ([k, v]) => {
      const bx = x(k),
        bw = x.bandwidth(),
        by = y(v),
        bh = H - m.b - by,
        rr = 3;
      return `M${bx},${by + rr} a${rr},${rr} 0 0 1 ${rr},-${rr} h${bw - 2 * rr}
              a${rr},${rr} 0 0 1 ${rr},${rr} v${bh - rr} h${-bw} Z`;
    })
    .attr("fill", cssv("--ember-2"));

  svg
    .append("g")
    .selectAll("text")
    .data(eras)
    .join("text")
    .attr("x", ([k]) => x(k) + x.bandwidth() / 2)
    .attr("y", ([, v]) => y(v) - 8)
    .attr("text-anchor", "middle")
    .attr("font-family", MONO)
    .attr("font-size", 13)
    .attr("fill", cssv("--ink"))
    .text(([, v]) => `${fmt(v)} ha`);
  axisText(svg.append("g").selectAll("text").data(eras).join("text"))
    .attr("x", ([k]) => x(k) + x.bandwidth() / 2)
    .attr("y", H - 10)
    .attr("text-anchor", "middle")
    .text(([k]) => k);
}

function figCause(annual, onYearClick) {
  const years = annual.years;
  const rows = years.map((yr, i) => {
    const N = annual.cause_ha.N[i],
      H_ = annual.cause_ha.H[i],
      U = annual.cause_ha.U[i];
    const tot = Math.max(1, N + H_ + U);
    return { year: yr, N: N / tot, H: H_ / tot, U: U / tot };
  });
  const svg = d3.select("#fig-cause svg");
  svg.selectAll("*").remove();
  const W = 872,
    H = 250,
    m = { t: 12, r: 12, b: 26, l: 40 };
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleLinear([years[0], years.at(-1)], [m.l, W - m.r]);
  const y = d3.scaleLinear([0, 1], [H - m.b, m.t]);
  const stack = d3.stack().keys(["N", "H", "U"])(rows);
  const c = colors();
  const color = { N: c.lightning, H: c.human, U: c.unknown };
  const area = d3
    .area()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);
  svg
    .append("g")
    .selectAll("path")
    .data(stack)
    .join("path")
    .attr("d", area)
    .attr("fill", (d) => color[d.key])
    .attr("stroke", cssv("--panel"))
    .attr("stroke-width", 2);

  axisText(
    svg
      .append("g")
      .selectAll("text")
      .data([1960, 1980, 2000, 2020])
      .join("text"),
  )
    .attr("x", (d) => x(d))
    .attr("y", H - 8)
    .attr("text-anchor", "middle")
    .text((d) => d);
  axisText(svg.append("g").selectAll("text").data([0, 0.5, 1]).join("text"))
    .attr("x", m.l - 8)
    .attr("y", (d) => y(d) + 3.5)
    .attr("text-anchor", "end")
    .text((d) => d * 100 + "%");

  const cross = svg
    .append("line")
    .attr("y1", m.t)
    .attr("y2", H - m.b)
    .attr("stroke", cssv("--ink"))
    .attr("opacity", 0);
  svg
    .append("rect")
    .attr("x", m.l)
    .attr("y", m.t)
    .attr("width", W - m.l - m.r)
    .attr("height", H - m.t - m.b)
    .attr("fill", "transparent")
    .on("pointermove", (ev) => {
      const yr = Math.round(
        Math.max(years[0], Math.min(years.at(-1), x.invert(d3.pointer(ev)[0]))),
      );
      cross.attr("x1", x(yr)).attr("x2", x(yr)).attr("opacity", 0.35);
      const d = rows[yr - years[0]];
      showTip(
        `<b>${yr}</b><br/>Lightning ${(d.N * 100).toFixed(0)}%<br/>Human ${(d.H * 100).toFixed(0)}%` +
          `<br/><span class="t-muted">Unknown ${(d.U * 100).toFixed(0)}% · click to scrub the map</span>`,
        ev.clientX,
        ev.clientY,
      );
    })
    .on("pointerleave", () => {
      cross.attr("opacity", 0);
      hideTip();
    })
    .on("click", (ev) => {
      const yr = Math.round(
        Math.max(years[0], Math.min(years.at(-1), x.invert(d3.pointer(ev)[0]))),
      );
      onYearClick(yr);
    })
    .style("cursor", "pointer");
}

function figProvinces(annual) {
  const years = annual.years;
  const agencies = Object.entries(annual.province_ha).sort(
    (a, b) => d3.sum(b[1]) - d3.sum(a[1]),
  );
  const NAMES = {
    NT: "Northwest Territories",
    MB: "Manitoba",
    BC: "British Columbia",
    SK: "Saskatchewan",
    ON: "Ontario",
    QC: "Quebec",
    YT: "Yukon",
    AB: "Alberta",
    PC: "Parks Canada",
    NL: "Newfoundland & Labrador",
    NB: "New Brunswick",
    NS: "Nova Scotia",
  };
  const svg = d3.select("#fig-prov svg");
  svg.selectAll("*").remove();
  const cols = 4,
    rows = Math.ceil(agencies.length / cols);
  const cw = 218,
    ch = 158,
    W = cols * cw,
    H = rows * ch + 8;
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const ymax = d3.max(agencies, ([, v]) => d3.max(v)) / 1e6;
  const crosses = [];

  agencies.forEach(([ag, ha], k) => {
    const gx = (k % cols) * cw,
      gy = Math.floor(k / cols) * ch;
    const g = svg.append("g").attr("transform", `translate(${gx},${gy})`);
    const m = { t: 10, r: 12, b: 26, l: 10 };
    const x = d3.scaleLinear([years[0], years.at(-1)], [m.l, cw - m.r]);
    const y = d3.scaleLinear([0, ymax], [ch - m.b, m.t]);
    const mha = ha.map((v) => v / 1e6);
    g.append("path")
      .attr(
        "d",
        d3
          .area()
          .x((d, i) => x(years[i]))
          .y0(y(0))
          .y1((d) => y(d))(mha),
      )
      .attr("fill", cssv("--ember-2"))
      .attr("opacity", 0.85);
    g.append("line")
      .attr("x1", m.l)
      .attr("x2", cw - m.r)
      .attr("y1", y(0) + 0.5)
      .attr("y2", y(0) + 0.5)
      .attr("stroke", cssv("--rule"));
    const lbl = g
      .append("text")
      .attr("x", m.l + (cw - m.l - m.r) / 2)
      .attr("y", ch - 8)
      .attr("text-anchor", "middle");
    lbl
      .append("tspan")
      .attr("font-family", MONO)
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("fill", cssv("--ink"))
      .text(ag);
    lbl
      .append("tspan")
      .attr("dx", 6)
      .attr("font-family", SANS)
      .attr("font-size", 10.5)
      .attr("fill", cssv("--faint"))
      .text(NAMES[ag] ?? "");
    const cross = g
      .append("line")
      .attr("y1", m.t)
      .attr("y2", ch - m.b)
      .attr("stroke", cssv("--ink"))
      .attr("opacity", 0);
    crosses.push({ cross, x, ag, mha });
  });

  svg
    .on("pointermove", (ev) => {
      const [mx] = d3.pointer(ev);
      const local = mx % cw;
      const c0 = crosses[0];
      const yr = Math.round(
        Math.max(years[0], Math.min(years.at(-1), c0.x.invert(local))),
      );
      const i = yr - years[0];
      for (const { cross, x } of crosses)
        cross.attr("x1", x(yr)).attr("x2", x(yr)).attr("opacity", 0.3);
      const lines = crosses
        .slice(0, 6)
        .map(({ ag, mha }) => `${ag} ${mha[i].toFixed(2)}`)
        .join(" · ");
      showTip(
        `<b>${yr}</b> Mha<br/><span class="t-muted">${lines}</span>`,
        ev.clientX,
        ev.clientY,
      );
    })
    .on("pointerleave", () => {
      for (const { cross } of crosses) cross.attr("opacity", 0);
      hideTip();
    });
}

function topTable(annual, handlers) {
  const el = document.getElementById("top-table");
  const rows = annual.top_fires
    .map(
      (f) => `
    <tr data-rank="${f.rank}" data-i="${f.i}">
      <td>${f.rank}</td>
      <td>${f.year}</td>
      <td>${f.agency}</td>
      <td class="name">${f.name || "—"}</td>
      <td>${fmt(f.ha)}</td>
    </tr>`,
    )
    .join("");
  el.innerHTML = `<table>
    <thead><tr><th>#</th><th>Year</th><th>Agency</th><th class="name">Fire</th><th>Hectares</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  el.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("pointerenter", () => {
      el.querySelectorAll("tr.active").forEach((t) =>
        t.classList.remove("active"),
      );
      tr.classList.add("active");
      handlers.onTopHover(+tr.dataset.rank, +tr.dataset.i);
    });
    tr.addEventListener("click", () =>
      handlers.onTopHover(+tr.dataset.rank, +tr.dataset.i),
    );
  });
  el.addEventListener("pointerleave", () => {
    el.querySelectorAll("tr.active").forEach((t) =>
      t.classList.remove("active"),
    );
    handlers.onTopLeave();
  });
}

function annualTable(annual) {
  const el = document.getElementById("annual-table");
  const nbacByYear = new Map(
    annual.nbac.years.map((y, i) => [y, annual.nbac.ha_adj[i]]),
  );
  const rows = annual.years
    .map(
      (yr, i) => `
    <tr><td>${yr}</td><td>${fmt(annual.nfdb.fires[i])}</td>
    <td>${(annual.nfdb.ha[i] / 1e6).toFixed(2)}</td>
    <td>${nbacByYear.has(yr) ? (nbacByYear.get(yr) / 1e6).toFixed(2) : "—"}</td></tr>`,
    )
    .join("");
  el.innerHTML = `<div class="wrap"><table>
    <thead><tr><th>Year</th><th>Large fires</th><th>Mha (NFDB)</th><th>Mha (NBAC adj)</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function drawAllCharts(annual, handlers) {
  figAnnual(annual, handlers.onYearClick);
  figSize(annual);
  figCause(annual, handlers.onYearClick);
  figProvinces(annual);
}

export function buildTables(annual, handlers) {
  topTable(annual, handlers);
  annualTable(annual);
}
