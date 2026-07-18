import { buildTables, drawAllCharts, drawTrackSpark } from "./charts.js";
import { FirmsLayer, TextureLayers } from "./layers.js";
import { ASPECT, FireScene } from "./scene.js";
import { initScrolly } from "./scrolly.js";
import {
  cssv,
  emberRamp,
  initTheme,
  onThemeChange,
  severityRamp,
} from "./theme.js";

const fmt = new Intl.NumberFormat("en-CA");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = (id) => document.getElementById(id);

async function boot() {
  initTheme();
  const [fires, annual, basemap] = await Promise.all([
    fetch("assets/fires.json").then((r) => r.json()),
    fetch("assets/annual.json").then((r) => r.json()),
    fetch("assets/basemap.json").then((r) => r.json()),
  ]);

  const cumHa = new Float64Array(fires.meta.n + 1);
  for (let i = 0; i < fires.meta.n; i++) cumHa[i + 1] = cumHa[i] + fires.ha[i];

  const scene = new FireScene(el("scene-canvas"), { fires, annual, basemap });
  const layers = new TextureLayers(scene);
  const firms = new FirmsLayer(scene);

  const Y0 = fires.meta.years[0],
    Y1 = fires.meta.years[1];
  const state = {
    mode: "years",
    t: Y1 + 0.99,
    day: 1,
    playing: false,
    layer: "fires",
    lastTs: null,
  };
  let scars = null;

  const scrub = el("scrub");
  const playBtn = el("play");
  const mhaSeries = annual.nfdb.ha.map((h) => h / 1e6);

  function bisectT(t) {
    let lo = 0,
      hi = fires.meta.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fires.t[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function syncHud() {
    if (state.mode === "years") {
      const hi = bisectT(state.t);
      el("hud-big").textContent = Math.floor(state.t);
      el("hud-a").textContent = fmt.format(hi);
      el("hud-a-label").textContent = `large fires since ${Y0}`;
      el("hud-b").textContent = (cumHa[hi] / 1e6).toFixed(1);
      el("hud-b-label").textContent = "Mha burned";
      scrub.value = state.t;
    } else {
      const d = Math.max(1, Math.min(365, Math.floor(state.day)));
      const date = new Date(2023, 0, d);
      el("hud-big").textContent = date
        .toLocaleDateString("en-CA", { month: "short", day: "numeric" })
        .toUpperCase();
      const meta = firms.meta;
      el("hud-a").textContent = fmt.format(meta.dailyCount[d] ?? 0);
      el("hud-a-label").textContent = "VIIRS detections today";
      let cum = 0;
      for (let k = 1; k <= d; k++) cum += meta.dailyCount[k] ?? 0;
      el("hud-b").textContent = fmt.format(cum);
      el("hud-b-label").textContent = "detections in 2023";
      scrub.value = state.day;
    }
  }

  function apply() {
    if (state.mode === "years") scene.setT(state.t);
    else firms.setDay(state.day);
    syncHud();
  }

  function setPlaying(p) {
    state.playing = p;
    state.lastTs = null;
    playBtn.textContent = p ? "⏸" : "▶";
    playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  }

  scene.tick = () => {
    if (!state.playing) return;
    const now = performance.now();
    const dt = state.lastTs ? (now - state.lastTs) / 1000 : 0;
    state.lastTs = now;
    if (state.mode === "years") {
      state.t += dt / 0.35;
      if (state.t >= Y1 + 0.99) {
        state.t = Y1 + 0.99;
        setPlaying(false);
      }
    } else {
      state.day += dt * 32;
      if (state.day >= 365) {
        state.day = 365;
        setPlaying(false);
      }
    }
    apply();
  };

  playBtn.addEventListener("click", () => {
    if (!state.playing) {
      if (state.mode === "years" && state.t >= Y1 + 0.9) state.t = Y0;
      if (state.mode === "2023" && state.day >= 364) state.day = 1;
    }
    setPlaying(!state.playing);
    apply();
  });

  scrub.addEventListener("input", () => {
    if (state.mode === "years") state.t = +scrub.value;
    else state.day = +scrub.value;
    setPlaying(false);
    apply();
  });

  addEventListener("keydown", (ev) => {
    if (
      ev.code === "Space" &&
      !timeline.hidden &&
      !["INPUT", "BUTTON", "A", "SUMMARY"].includes(
        document.activeElement.tagName,
      )
    ) {
      ev.preventDefault();
      playBtn.click();
    }
  });

  function setTimelineMode(mode) {
    if (mode === "years") {
      scrub.min = Y0;
      scrub.max = Y1 + 0.99;
      scrub.step = 0.01;
      el("tick-lo").textContent = Y0;
      el("tick-hi").textContent = Y1;
      drawTrackSpark(el("track-spark"), mhaSeries, 2023 - Y0);
    } else {
      scrub.min = 1;
      scrub.max = 365;
      scrub.step = 0.05;
      el("tick-lo").textContent = "JAN";
      el("tick-hi").textContent = "DEC";
      drawTrackSpark(el("track-spark"), firms.meta.dailyCount.slice(1), null);
    }
  }

  function sizeKeyHtml() {
    const ramp = emberRamp();
    const dots = [3, 6, 10, 15, 21]
      .map(
        (s, i) =>
          `<span class="k"><span class="d" style="width:${s}px;height:${s}px;background:${ramp[i]}"></span></span>`,
      )
      .join("");
    return `<span>200&thinsp;ha</span>${dots}<span>1&thinsp;Mha</span>`;
  }

  function syncLegend() {
    const box = el("legend-box");
    if (state.mode === "2023") {
      box.innerHTML = `<span>VIIRS thermal detections, sized by daily count per 6 km cell; earlier days remain as gray scars</span>`;
    } else if (state.layer === "fires") {
      box.innerHTML = sizeKeyHtml();
    } else {
      box.innerHTML = layers.legendHtml(state.layer);
    }
  }

  function railSwatch(name) {
    const ramp = emberRamp();
    if (name === "fires")
      return `<span class="sw-dot" style="background:${ramp[2]}"></span>`;
    const stops =
      name === "trend"
        ? [cssv("--trend-neg"), cssv("--trend-mid"), cssv("--trend-pos")]
        : name === "severity"
          ? severityRamp()
          : [ramp[0], ramp[2], ramp[4]];
    return `<span class="sw-ramp" style="background:linear-gradient(90deg,${stops.join(",")})"></span>`;
  }
  function drawRailSwatches() {
    document.querySelectorAll("#layer-pick button").forEach((b) => {
      b.querySelector(".sw-dot, .sw-ramp")?.remove();
      b.insertAdjacentHTML("afterbegin", railSwatch(b.dataset.layer));
    });
  }

  const timeline = document.querySelector(".timeline");
  // Static layers have nothing to scrub; a plain rule for it
  function showTimeline(on) {
    timeline.hidden = !on;
    el("scrub-rule").hidden = on;
  }
  async function setLayer(name) {
    state.layer = name;
    syncRail();
    if (name === "fires") {
      layers.hide();
      scene.setEmbersHidden(false);
      showTimeline(true);
    } else {
      setPlaying(false);
      await layers.show(name);
      scene.setEmbersHidden(true);
      showTimeline(false);
    }
    syncLegend();
  }
  // No layer is checked during the replay; none of them is what the map shows.
  function syncRail() {
    document.querySelectorAll("#layer-pick button").forEach((b) => {
      b.setAttribute(
        "aria-checked",
        state.mode === "years" && b.dataset.layer === state.layer,
      );
    });
    el("mode-2023").setAttribute("aria-checked", state.mode === "2023");
    el("span-years").setAttribute("aria-checked", state.mode === "years");
  }
  document.querySelectorAll("#layer-pick button").forEach((b) => {
    b.addEventListener("click", () => {
      if (state.mode === "2023") exit2023();
      setLayer(b.dataset.layer);
    });
  });

  const modeBtn = el("mode-2023");
  async function enter2023() {
    await firms.load();
    state.mode = "2023";
    state.day = reduceMotion ? 365 : 1;
    layers.hide();
    scene.setEmbersHidden(true);
    firms.setVisible(true);
    showTimeline(true);
    setTimelineMode("2023");
    syncRail();
    if (!reduceMotion) setPlaying(true);
    apply();
    syncLegend();
  }
  function exit2023() {
    state.mode = "years";
    firms.setVisible(false);
    setPlaying(false);
    setTimelineMode("years");
    setLayer(state.layer);
    apply();
  }
  modeBtn.addEventListener("click", () => state.mode !== "2023" && enter2023());
  el("span-years").addEventListener(
    "click",
    () => state.mode === "2023" && exit2023(),
  );

  async function onTopHover(rank, i) {
    if (!scars) scars = await fetch("assets/scars.json").then((r) => r.json());
    state.t = Y1 + 0.99;
    setPlaying(false);
    apply();
    const feature = scars.fires.find((f) => f.rank === rank);
    if (feature) {
      scene.showScar(feature);
    } else {
      scene.clearScar();
      scene.flyTo(fires.x[i] * ASPECT, fires.y[i], 0.3);
    }
  }
  function onTopLeave() {
    scene.clearScar();
    scene.flyHome();
  }
  function onYearClick(year) {
    if (state.mode === "2023") exit2023();
    if (state.layer !== "fires") setLayer("fires");
    state.t = year + 0.99;
    setPlaying(false);
    apply();
    el("scene").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Draw the map and charts before the rail
  drawAllCharts(annual, { onYearClick });
  buildTables(annual, { onTopHover, onTopLeave });
  setTimelineMode("years");
  syncLegend();
  apply();
  drawRailSwatches();
  syncRail();

  const q = new URLSearchParams(location.search);
  const qLayer = q.get("layer") === "embers" ? "fires" : q.get("layer");
  if (qLayer && document.querySelector(`#layer-pick [data-layer="${qLayer}"]`))
    setLayer(qLayer);
  if (q.get("year")) {
    state.t = Math.min(Y1 + 0.99, +q.get("year") + 0.99);
    apply();
  }
  if (q.get("mode") === "2023") {
    await enter2023();
    setPlaying(false);
    state.day = Math.max(1, Math.min(365, +(q.get("day") ?? 240)));
    apply();
  }
  if (q.get("scar")) {
    const tf = annual.top_fires.find((f) => f.rank === +q.get("scar"));
    if (tf) onTopHover(tf.rank, tf.i);
  }

  onThemeChange(() => {
    scene.applyTheme();
    layers.applyTheme();
    firms.applyTheme();
    drawAllCharts(annual, { onYearClick });
    setTimelineMode(state.mode);
    drawRailSwatches();
    syncLegend();
  });

  initScrolly(scene, () => setPlaying(false));
}

boot();
