const listeners = [];

export function themeName() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function cssv(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function colors() {
  return {
    paper: cssv("--paper"),
    panel: cssv("--panel"),
    panel2: cssv("--panel-2"),
    ink: cssv("--ink"),
    muted: cssv("--muted"),
    faint: cssv("--faint"),
    rule: cssv("--rule"),
    land: cssv("--land"),
    ember: [
      cssv("--ember-1"),
      cssv("--ember-2"),
      cssv("--ember-3"),
      cssv("--ember-4"),
      cssv("--ember-5"),
    ],
    lightning: cssv("--lightning"),
    human: cssv("--human"),
    unknown: cssv("--unknown"),
    trendNeg: cssv("--trend-neg"),
    trendMid: cssv("--trend-mid"),
    trendPos: cssv("--trend-pos"),
  };
}

// Ramps index small--->big fire.
export function emberRamp() {
  const e = colors().ember;
  return themeName() === "dark"
    ? [e[4], e[3], e[2], e[1], e[0]]
    : [e[0], e[1], e[2], e[3], e[4]];
}

export function onThemeChange(fn) {
  listeners.push(fn);
}

const SUN_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

export function setTheme(name) {
  if (name === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
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
