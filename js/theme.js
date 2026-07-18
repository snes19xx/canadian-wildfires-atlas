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

// Burn severity classes, low -> high.
export function severityRamp() {
  return [cssv("--sev-1"), cssv("--sev-2"), cssv("--sev-3")];
}

export function onThemeChange(fn) {
  listeners.push(fn);
}

const SUN_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.4"/><path d="M12 1.4v2.4M12 20.2v2.4M1.4 12h2.4M20.2 12h2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M19.5 4.5l-1.7 1.7M6.2 17.8l-1.7 1.7"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.8 8.8 0 1 0 10.8 10.8Z"/></svg>`;

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
