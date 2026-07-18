import * as d3 from "d3";
import { ASPECT, makeSprite } from "./scene.js";
import { colors, emberRamp, severityRamp, themeName } from "./theme.js";

// Smooth sampling blends masked zeros through the scale (diverging: fake
// "decreasing" rims; classes: fake lower classes), so these draw nearest.
const NEAREST = ["severity", "reburns", "trend"];

export class TextureLayers {
  constructor(scene) {
    this.scene = scene;
    this.meta = null;
    this.images = {};
    this.colored = {};
    this.active = null;
  }

  async load(name) {
    if (!this.meta) {
      this.meta = await (await fetch("assets/layers/layers.json")).json();
    }
    if (!this.images[name]) {
      const img = new Image();
      img.src = `assets/layers/${this.meta[name].file}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      this.images[name] = g.getImageData(0, 0, img.width, img.height);
    }
    return this.images[name];
  }

  lut(name) {
    const m = this.meta[name];
    const c = colors();
    const out = new Uint8ClampedArray(256 * 4);
    const set = (i, col) => {
      const { r, g, b } = d3.rgb(col);
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 255;
    };
    if (m.kind === "sequential") {
      const ramp = d3.piecewise(d3.interpolateRgb, emberRamp());
      for (let v = 1; v < 256; v++) set(v, ramp((v - 1) / 254));
    } else if (m.kind === "diverging") {
      for (let v = 1; v < 256; v++) {
        const s = (v - 128) / 127;
        set(
          v,
          s < 0
            ? d3.interpolateRgb(c.trendMid, c.trendNeg)(-s)
            : d3.interpolateRgb(c.trendMid, c.trendPos)(s),
        );
      }
    } else {
      const ramp = emberRamp();
      const cls =
        name === "severity" ? severityRamp() : [ramp[1], ramp[2], ramp[4]];
      for (let v = 1; v < 256; v++) set(v, cls[v < 128 ? 0 : v < 213 ? 1 : 2]);
    }
    return out;
  }

  colorize(name) {
    const key = `${themeName()}:${name}`;
    if (!this.colored[key]) {
      const src = this.images[name];
      const lut = this.lut(name);
      const cv = document.createElement("canvas");
      cv.width = src.width;
      cv.height = src.height;
      const g = cv.getContext("2d");
      const out = g.createImageData(src.width, src.height);
      const a = src.data,
        b = out.data;
      for (let i = 0; i < a.length; i += 4) {
        const v = a[i];
        if (!v) continue;
        b[i] = lut[v * 4];
        b[i + 1] = lut[v * 4 + 1];
        b[i + 2] = lut[v * 4 + 2];
        b[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      this.colored[key] = cv;
    }
    return this.colored[key];
  }

  // Density Contours: The density layer is a continuous raster,
  // but I show it as a set of filled contours:
  densityPaths() {
    if (!this._densityContours) {
      const src = this.images.density;
      const nx = src.width,
        ny = src.height;
      const vals = new Float64Array(nx * ny);
      for (let i = 0; i < vals.length; i++) vals[i] = src.data[i * 4];
      const toPath = d3.geoPath();
      this._densityContours = {
        nx,
        ny,
        paths: d3
          .contours()
          .size([nx, ny])
          .thresholds([1, 43, 86, 128, 170, 213])(vals)
          .map((mp) => new Path2D(toPath(mp))),
      };
    }
    const { nx, ny, paths } = this._densityContours;
    const interp = d3.piecewise(d3.interpolateRgb, emberRamp());
    const land = colors().land;
    const mix = themeName() === "dark" ? 0.9 : 0.85;
    const bands = paths.map((p, i) => ({
      path: p,
      fill: d3.interpolateRgb(land, interp((i + 0.5) / paths.length))(mix),
    }));
    return { nx, ny, bands, stroke: interp(0.95) };
  }

  async show(name) {
    await this.load(name);
    this.active = name;
    if (name === "density") {
      this.scene.layerImage = null;
      this.scene.layerPaths = this.densityPaths();
    } else {
      this.scene.layerPaths = null;
      this.scene.layerImage = {
        canvas: this.colorize(name),
        smooth: !NEAREST.includes(name),
        alpha: themeName() === "dark" ? 0.88 : 0.82,
      };
    }
    this.scene.requestRender();
  }

  hide() {
    this.active = null;
    this.scene.layerImage = null;
    this.scene.layerPaths = null;
    this.scene.requestRender();
  }

  applyTheme() {
    if (this.active) this.show(this.active);
  }

  legendHtml(name) {
    const m = this.meta?.[name];
    if (!m) return "";
    const ramp = emberRamp();
    if (name === "trend") {
      const c = colors();
      return `<span class="k"><span class="sw" style="background:${c.trendNeg}"></span>decreasing</span>
              <span class="k"><span class="sw" style="background:${c.trendMid}"></span>no trend</span>
              <span class="k"><span class="sw" style="background:${c.trendPos}"></span>increasing</span>`;
    }
    if (m.kind === "classes") {
      const cls =
        name === "severity" ? severityRamp() : [ramp[1], ramp[2], ramp[4]];
      return m.legend
        .map(
          (l, i) =>
            `<span class="k"><span class="sw" style="background:${cls[i]}"></span>${l}</span>`,
        )
        .join("");
    }
    if (name === "density" && this.images.density) {
      const bands = this.densityPaths().bands;
      return (
        `<span>${m.legend[0]}</span>` +
        bands
          .map(
            (b) =>
              `<span class="k"><span class="sw" style="background:${b.fill}"></span></span>`,
          )
          .join("") +
        `<span>${m.legend[m.legend.length - 1]}</span>`
      );
    }
    const stops = [ramp[0], ramp[2], ramp[4]];
    return (
      `<span>${m.legend[0]}</span>` +
      stops
        .map(
          (h) =>
            `<span class="k"><span class="sw" style="background:${h}"></span></span>`,
        )
        .join("") +
      `<span>${m.legend[m.legend.length - 1]}</span>`
    );
  }
}

export class FirmsLayer {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.visible = false;
    this.day = 0;
    scene.addDrawable(this);
  }

  async load() {
    if (this.ready) return this;
    const [meta, buf] = await Promise.all([
      (await fetch("assets/firms2023.json")).json(),
      (await fetch("assets/firms2023.bin")).arrayBuffer(),
    ]);
    this.meta = meta;
    const s = new Uint16Array(buf);
    const n = s.length / 3;
    const { nx, ny } = meta.grid;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.dayOf = new Float32Array(n);
    this.mag = new Float32Array(n);
    const dayIndex = meta.dayIndex;
    let d = 1;
    for (let i = 0; i < n; i++) {
      while (d < 365 && i >= dayIndex[d + 1]) d++;
      this.x[i] = ((s[i * 3] + 0.5) / nx) * ASPECT;
      this.y[i] = (s[i * 3 + 1] + 0.5) / ny;
      this.dayOf[i] = d;
      this.mag[i] = Math.min(1, Math.log10(s[i * 3 + 2] + 1) / 2.5);
    }
    this.applyTheme();
    this.ready = true;
    return this;
  }

  applyTheme() {
    const interp = d3.piecewise(d3.interpolateRgb, emberRamp());
    const dark = themeName() === "dark";
    this.sprites = d3
      .range(16)
      .map((i) => makeSprite(interp(i / 15), { soft: dark ? 0.25 : 0.55 }));
    const ash = d3.interpolateRgb(
      interp(0.3),
      dark ? "#4d4d4d" : "#b3b3b3",
    )(0.6);
    this.scarSprite = makeSprite(ash, { soft: 0.5, alpha: dark ? 0.22 : 0.14 });
    this.scene.requestRender();
  }

  draw(scene) {
    if (!this.visible || !this.ready) return;
    const ctx = scene.ctx,
      zt = scene.zoomT;
    const a = scene.k0 * zt.k;
    const bx = scene.ox * zt.k + zt.x,
      by = scene.oy * zt.k + zt.y;
    const sizeScale = (scene.k0 / 624) * Math.sqrt(zt.k);
    const fd = Math.max(1, Math.min(365, Math.floor(this.day)));
    const hi = this.meta.dayIndex[Math.min(366, fd + 1)] ?? this.n;
    const cut = Math.floor(this.day) - 6;
    const scarHi =
      cut >= 1
        ? Math.min(hi, this.meta.dayIndex[Math.min(366, cut + 1)] ?? this.n)
        : 0;
    // Scars composite normally: additive blending would sum the season's
    // footprint back up to active-fire brightness.
    for (let i = 0; i < scarHi; i++) {
      const sx = this.x[i] * a + bx,
        sy = this.y[i] * a + by;
      if (sx < -30 || sx > scene.w + 30 || sy < -30 || sy > scene.h + 30)
        continue;
      const px = Math.min((2 + 6 * this.mag[i]) * sizeScale, 30);
      ctx.drawImage(this.scarSprite, sx - px / 2, sy - px / 2, px, px);
    }
    ctx.globalCompositeOperation =
      themeName() === "dark" ? "lighter" : "source-over";
    for (let i = scarHi; i < hi; i++) {
      const sx = this.x[i] * a + bx,
        sy = this.y[i] * a + by;
      if (sx < -30 || sx > scene.w + 30 || sy < -30 || sy > scene.h + 30)
        continue;
      const age = this.day - this.dayOf[i];
      const pulse = Math.max(0, 1 - age / 1.5);
      const px = Math.min(
        (2 + 6 * this.mag[i]) * (1 + 0.8 * pulse) * sizeScale,
        30,
      );
      ctx.globalAlpha = Math.max(0.15, 1 - age / 6);
      ctx.drawImage(
        this.sprites[Math.round(this.mag[i] * 15)],
        sx - px / 2,
        sy - px / 2,
        px,
        px,
      );
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  setDay(day) {
    this.day = day;
    this.scene.requestRender();
  }

  setVisible(v) {
    this.visible = v;
    this.scene.requestRender();
  }
}
