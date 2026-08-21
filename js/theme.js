const listeners = [];

export function themeName() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function mapScope() {
  return document.getElementById("scene-canvas") ?? document.documentElement;
}

const VARS = [
  "--paper",
  "--panel",
  "--panel-2",
  "--ink",
  "--muted",
  "--faint",
  "--rule",
  "--land",
  "--ember-1",
  "--ember-2",
  "--ember-3",
  "--ember-4",
  "--ember-5",
  "--lightning",
  "--human",
  "--unknown",
  "--trend-neg",
  "--trend-mid",
  "--trend-pos",
  "--sev-1",
  "--sev-2",
  "--sev-3",
];

let cache = new WeakMap();

function read(el) {
  let entry = cache.get(el);
  if (!entry) {
    const cs = getComputedStyle(el);
    const vars = {};
    for (const name of VARS) vars[name] = cs.getPropertyValue(name).trim();
    entry = { vars, colors: null, ember: null, severity: null };
    cache.set(el, entry);
  }
  return entry;
}

export function cssv(name, scope) {
  const el = scope ?? mapScope();
  const v = read(el).vars[name];
  return v ?? getComputedStyle(el).getPropertyValue(name).trim();
}

export function colors(scope) {
  const entry = read(scope ?? mapScope());
  if (!entry.colors) {
    const v = entry.vars;
    entry.colors = {
      paper: v["--paper"],
      panel: v["--panel"],
      panel2: v["--panel-2"],
      ink: v["--ink"],
      muted: v["--muted"],
      faint: v["--faint"],
      rule: v["--rule"],
      land: v["--land"],
      ember: [
        v["--ember-1"],
        v["--ember-2"],
        v["--ember-3"],
        v["--ember-4"],
        v["--ember-5"],
      ],
      lightning: v["--lightning"],
      human: v["--human"],
      unknown: v["--unknown"],
      trendNeg: v["--trend-neg"],
      trendMid: v["--trend-mid"],
      trendPos: v["--trend-pos"],
    };
  }
  return entry.colors;
}

// Ramps index small--->big fire.
export function emberRamp(scope) {
  const entry = read(scope ?? mapScope());
  if (!entry.ember) {
    const e = colors(scope).ember;
    entry.ember =
      themeName() === "dark"
        ? [e[4], e[3], e[2], e[1], e[0]]
        : [e[0], e[1], e[2], e[3], e[4]];
  }
  return entry.ember;
}

// Burn severity classes, low -> high.
export function severityRamp(scope) {
  const entry = read(scope ?? mapScope());
  if (!entry.severity) {
    const v = entry.vars;
    entry.severity = [v["--sev-1"], v["--sev-2"], v["--sev-3"]];
  }
  return entry.severity;
}

export function onThemeChange(fn) {
  listeners.push(fn);
}

const SUN_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.4"/><path d="M12 1.4v2.4M12 20.2v2.4M1.4 12h2.4M20.2 12h2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M19.5 4.5l-1.7 1.7M6.2 17.8l-1.7 1.7"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.8 8.8 0 1 0 10.8 10.8Z"/></svg>`;

export function setTheme(name) {
  if (name === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  cache = new WeakMap();
  localStorage.setItem("atlas-theme", name);
  const btn = document.getElementById("theme-btn");
  if (btn)
    btn.innerHTML = name === "dark" ? `${MOON_ICON}Dark` : `${SUN_ICON}Light`;
  for (const fn of listeners) fn(name);
}

export function initTheme() {
  const saved = localStorage.getItem("atlas-theme");
  const hash =
    location.hash === "#dark"
      ? "dark"
      : location.hash === "#light"
        ? "light"
        : null;
  const name = hash ?? saved ?? "dark";
  setTheme(name);
  document.getElementById("theme-btn").addEventListener("click", () => {
    setTheme(themeName() === "dark" ? "light" : "dark");
  });
}
