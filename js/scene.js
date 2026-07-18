import * as d3 from "d3";
import { colors, emberRamp, themeName } from "./theme.js";

// Scene coords are [0,1]² frame; x is stretched by the frame aspect.
// Canvas world coords: X = u * ASPECT, Y = 1 - v (y grows down).
export const ASPECT = 1.4979;

export function makeSprite(color, { size = 64, soft = 0.55, alpha = 1 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  const c = d3.color(color).copy({ opacity: alpha });
  grad.addColorStop(0, c + "");
  grad.addColorStop(soft, c + "");
  grad.addColorStop(1, d3.color(color).copy({ opacity: 0 }) + "");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

export class FireScene {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.t = data.fires.meta.years[0];
    this.embersHidden = false;
    this.layerImage = null;
    this.layerPaths = null;
    this.drawables = [];
    this.scar = null;
    this.flight = null;
    this.visible = true;

    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.zoomT = d3.zoomIdentity;

    // Plain wheel must scroll the page past the map, so zoom needs a modifier
    // (or pinch, which arrives as a ctrlKey wheel); one-finger touch scrolls too.
    this.zoom = d3
      .zoom()
      .scaleExtent([1, 48])
      .filter((ev) => {
        if (ev.type === "wheel") return ev.ctrlKey || ev.metaKey;
        if (ev.type === "touchstart") return ev.touches.length > 1;
        return !ev.button;
      })
      .on("zoom", (ev) => {
        this.zoomT = ev.transform;
        if (!this.flightSetting) this.flight = null;
        this.requestRender();
      });
    d3.select(this.canvas).call(this.zoom);

    this.buildBasemap();
    this.buildEmbers();
    this.applyTheme();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    const loop = () => {
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  buildBasemap() {
    const ringPath = (path, ring) => {
      ring.forEach(([u, v], i) => {
        if (i === 0) path.moveTo(u * ASPECT, 1 - v);
        else path.lineTo(u * ASPECT, 1 - v);
      });
      path.closePath();
    };
    // Fill from the dissolved national outline:
    this.landPath = new Path2D();
    for (const ring of this.data.basemap.outline) ringPath(this.landPath, ring);
    this.provPath = new Path2D();
    for (const prov of this.data.basemap.provinces) {
      for (const ring of prov.rings) ringPath(this.provPath, ring);
    }
    // !!!The Arctic archipelago overshoots the [0,1]² data frame
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    for (const ring of this.data.basemap.outline) {
      for (const [u, v] of ring) {
        const X = u * ASPECT,
          Y = 1 - v;
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y);
        y1 = Math.max(y1, Y);
      }
    }
    this.bounds = [x0, y0, x1, y1];
  }

  buildEmbers() {
    const f = this.data.fires;
    const n = f.meta.n;
    this.ex = new Float32Array(n);
    this.ey = new Float32Array(n);
    this.base = new Float32Array(n);
    this.rampIdx = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.ex[i] = f.x[i] * ASPECT;
      this.ey[i] = 1 - f.y[i];
      const logHa = Math.log10(f.ha[i]);
      this.base[i] = Math.min(26, Math.max(2, 2 + 1.8 * (logHa - 2.3)));
      this.rampIdx[i] = Math.round(
        Math.min(1, Math.max(0, (logHa - 2.3) / 2.7)) * 23,
      );
    }
  }

  applyTheme() {
    this.c = colors();
    const interp = d3.piecewise(d3.interpolateRgb, emberRamp());
    const soft = themeName() === "dark" ? 0.25 : 0.55;
    this.sprites = d3
      .range(24)
      .map((i) => makeSprite(interp(i / 23), { soft }));
    const scarCol = emberRamp()[themeName() === "dark" ? 0 : 3];
    this.scarSprite = makeSprite(scarCol, { soft: 0.5 });
    this.requestRender();
  }

  setT(t) {
    this.t = t;
    this.requestRender();
  }

  setEmbersHidden(hidden) {
    this.embersHidden = hidden;
    this.requestRender();
  }

  addDrawable(obj) {
    this.drawables.push(obj);
  }

  resize() {
    // Base coords change with the fit, so a zoomed transform must be re-aimed
    // at the same world view
    let keep = null;
    if (this.k0 && this.zoomT.k !== 1) {
      const [cx, cy, vw] = this.viewOf(this.zoomT);
      keep = [(cx - this.ox) / this.k0, (cy - this.oy) / this.k0, vw / this.k0];
    }
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    this.w = w;
    this.h = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    // To keep Canada's southern tip clear of the timeline.
    const mx = 18,
      mt = 16,
      mb = 76;
    const [bx0, by0, bx1, by1] = this.bounds;
    const bw = bx1 - bx0,
      bh = by1 - by0;
    this.k0 = Math.min((w - 2 * mx) / bw, (h - mt - mb) / bh);
    this.ox = (w - this.k0 * bw) / 2 - this.k0 * bx0;
    this.oy = mt + (h - mt - mb - this.k0 * bh) / 2 - this.k0 * by0;
    this.zoom
      .extent([
        [0, 0],
        [w, h],
      ])
      .translateExtent([
        [0, 0],
        [w, h],
      ]);
    if (keep) {
      this.setTransform(
        this.transformOf([
          keep[0] * this.k0 + this.ox,
          keep[1] * this.k0 + this.oy,
          keep[2] * this.k0,
        ]),
      );
    }
    // Repaint it now not the next frame
    this.render();
    this.needsRender = false;
  }

  requestRender() {
    this.needsRender = true;
  }

  frame() {
    if (!this.visible) return;
    if (this.flight) this.stepFlight();
    if (this.tick) this.tick();
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
  }

  worldTransform() {
    const t = this.zoomT;
    this.ctx.translate(t.x, t.y);
    this.ctx.scale(t.k, t.k);
    this.ctx.translate(this.ox, this.oy);
    this.ctx.scale(this.k0, this.k0);
  }

  render() {
    const ctx = this.ctx,
      c = this.c;
    const k = this.k0 * this.zoomT.k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.save();
    this.worldTransform();
    ctx.fillStyle = c.land;
    ctx.fill(this.landPath);
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = c.rule;
    ctx.stroke(this.provPath);
    ctx.strokeStyle = c.faint;
    ctx.globalAlpha = 0.8;
    ctx.stroke(this.landPath);
    ctx.globalAlpha = 1;
    if (this.layerImage) {
      ctx.imageSmoothingEnabled = this.layerImage.smooth;
      ctx.globalAlpha = this.layerImage.alpha;
      ctx.drawImage(this.layerImage.canvas, 0, 0, ASPECT, 1);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
    }
    if (this.layerPaths) {
      const lp = this.layerPaths;
      const s = ASPECT / lp.nx;
      ctx.save();
      ctx.scale(s, 1 / lp.ny);
      for (const b of lp.bands) {
        ctx.fillStyle = b.fill;
        ctx.fill(b.path);
      }
      ctx.lineWidth = 0.7 / (k * s);
      ctx.strokeStyle = lp.stroke;
      ctx.globalAlpha = 0.3;
      for (const b of lp.bands) ctx.stroke(b.path);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.restore();

    if (!this.embersHidden) this.drawEmbers();
    for (const d of this.drawables) d.draw(this);

    if (this.scar) {
      ctx.save();
      this.worldTransform();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = c.ember[2];
      ctx.fill(this.scar);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5 / k;
      ctx.strokeStyle = c.ember[1];
      ctx.stroke(this.scar);
      ctx.restore();
    }
  }

  bisectT(t) {
    const ft = this.data.fires.t;
    let lo = 0,
      hi = ft.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ft[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  drawEmbers() {
    const ctx = this.ctx,
      f = this.data.fires;
    const hi = this.bisectT(this.t);
    const dark = themeName() === "dark";
    const zt = this.zoomT,
      a = this.k0 * zt.k;
    const bx = this.ox * zt.k + zt.x,
      by = this.oy * zt.k + zt.y;
    const sizeScale = (this.k0 / 624) * Math.sqrt(zt.k);
    const floor = dark ? 0.14 : 0.3,
      flareK = dark ? 2.2 : 0.6;
    const scarA = dark ? 0.12 : 0.22;
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (let i = 0; i < hi; i++) {
      const sx = this.ex[i] * a + bx,
        sy = this.ey[i] * a + by;
      if (sx < -40 || sx > this.w + 40 || sy < -40 || sy > this.h + 40)
        continue;
      const age = this.t - f.t[i];
      let sprite, alpha, px;
      if (age >= 3) {
        sprite = this.scarSprite;
        alpha = scarA;
        px = Math.min(this.base[i] * sizeScale, 38);
      } else {
        const pulse = Math.max(0, 1 - age / 0.35);
        alpha = Math.min(
          1,
          Math.max(floor, 1 - age / 3) * (1 + flareK * pulse),
        );
        px = Math.min(this.base[i] * (1 + 0.55 * pulse) * sizeScale, 38);
        sprite = this.sprites[this.rampIdx[i]];
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, sx - px / 2, sy - px / 2, px, px);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  showScar(feature) {
    const path = new Path2D();
    let minx = 1e9,
      miny = 1e9,
      maxx = -1e9,
      maxy = -1e9;
    for (const ring of feature.rings) {
      ring.forEach(([u, v], i) => {
        const X = u * ASPECT,
          Y = 1 - v;
        if (i === 0) path.moveTo(X, Y);
        else path.lineTo(X, Y);
        minx = Math.min(minx, X);
        maxx = Math.max(maxx, X);
        miny = Math.min(miny, Y);
        maxy = Math.max(maxy, Y);
      });
      path.closePath();
    }
    this.scar = path;
    const span = Math.max(maxx - minx, maxy - miny);
    this.flyToWorld(
      (minx + maxx) / 2,
      (miny + maxy) / 2,
      Math.max(0.09, span * 1.8),
    );
  }

  clearScar() {
    this.scar = null;
    this.requestRender();
  }

  // View triples [cx, cy, width] are in base-screen coords.
  viewOf(t) {
    return [(this.w / 2 - t.x) / t.k, (this.h / 2 - t.y) / t.k, this.w / t.k];
  }

  transformOf(view) {
    const k = this.w / view[2];
    return d3.zoomIdentity
      .translate(this.w / 2 - view[0] * k, this.h / 2 - view[1] * k)
      .scale(k);
  }

  setTransform(t) {
    this.flightSetting = true;
    d3.select(this.canvas).call(this.zoom.transform, t);
    this.flightSetting = false;
  }

  // wx, wy in scene coords (v up); span is the world height to frame.
  flyTo(wx, wy, span) {
    this.flyToWorld(wx, 1 - wy, span);
  }

  flyToWorld(X, Y, span) {
    const bx = X * this.k0 + this.ox,
      by = Y * this.k0 + this.oy;
    let vw = (span * this.k0 * this.w) / (0.85 * Math.min(this.w, this.h));
    vw = Math.min(this.w, Math.max(this.w / 48, vw));
    const to = [bx, by, vw];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.setTransform(this.transformOf(to));
      return;
    }
    this.flight = {
      interp: d3.interpolateZoom(this.viewOf(this.zoomT), to),
      start: performance.now(),
      ms: 800,
    };
  }

  flyHome() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.setTransform(d3.zoomIdentity);
      return;
    }
    this.flight = {
      interp: d3.interpolateZoom(
        this.viewOf(this.zoomT),
        this.viewOf(d3.zoomIdentity),
      ),
      start: performance.now(),
      ms: 800,
    };
  }

  stepFlight() {
    const f = this.flight;
    const k = Math.min(1, (performance.now() - f.start) / f.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.setTransform(this.transformOf(f.interp(e)));
    if (k >= 1) this.flight = null;
    this.needsRender = true;
  }

  setVisible(v) {
    this.visible = v;
    if (v) this.requestRender();
  }
}
