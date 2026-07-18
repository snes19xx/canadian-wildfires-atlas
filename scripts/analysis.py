import geopandas as gpd
import numpy as np
from scipy import ndimage, stats

import config
import project
import rasterout


def _land_mask(cell_m):
    """Rasterize Canada onto the frame grid; True = land."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds

    gdf = gpd.read_file(config.PROVINCES_SHP)
    admin_col = "admin" if "admin" in gdf.columns else "ADMIN"
    can = gdf[gdf[admin_col] == "Canada"].to_crs(config.CRS)
    ny, nx = rasterout.grid_shape(cell_m)
    transform = from_bounds(config.FRAME_W, config.FRAME_S, config.FRAME_E, config.FRAME_N, nx, ny)
    mask = rasterize(can.geometry, out_shape=(ny, nx), transform=transform, fill=0, default_value=1)
    return mask.astype(bool)


def export_density(nfdb, x_m, y_m):
    h = rasterout.bin_points(x_m, y_m, nfdb.SIZE_HA.values, config.DENSITY_CELL_M)
    sm = ndimage.gaussian_filter(h, sigma=5)
    sm *= _land_mask(config.DENSITY_CELL_M)
    logv = np.log1p(sm)
    vmin = np.log1p(50)
    vmax = float(logv.max())
    px = np.zeros_like(logv)
    on = logv > vmin
    px[on] = 1 + np.clip((logv[on] - vmin) / (vmax - vmin), 0, 1) ** 1.6 * 254
    rasterout.write_png("density", px)
    rasterout.update_meta("density", {
        "file": "density.png", "kind": "sequential", "encode": "log1p",
        "vmin_log": round(float(vmin), 4), "vmax_log": round(float(vmax), 4),
        "gamma": 1.6, "cell_m": config.DENSITY_CELL_M, "sigma_cells": 5,
        "legend": ["low", "burned area within ~25 km", "high"],
        "note": "Kernel-smoothed burned area, all large fires 1959-2025",
    })


def export_hotspots(nfdb, x_m, y_m):
    """Getis-Ord Gi* z-scores of total burned area on land cells."""
    from esda.getisord import G_Local
    from libpysal.weights import KNN

    cell = config.HOTSPOT_CELL_M
    h = rasterout.bin_points(x_m, y_m, nfdb.SIZE_HA.values, cell)
    land = _land_mask(cell)
    rows, cols = np.nonzero(land)
    cy = config.FRAME_N - (rows + 0.5) * cell
    cx = config.FRAME_W + (cols + 0.5) * cell
    w = KNN.from_array(np.column_stack([cx, cy]), k=8)
    g = G_Local(h[land], w, star=True)
    z = np.zeros_like(h)
    z[land] = g.Zs
    zmax = 8.0
    px = np.zeros_like(h)
    hot = (z >= 1.65) & land
    px[hot] = 1 + np.clip((z[hot] - 1.65) / (zmax - 1.65), 0, 1) * 254
    rasterout.write_png("hotspots", px)
    rasterout.update_meta("hotspots", {
        "file": "hotspots.png", "kind": "sequential", "encode": "linear",
        "vmin": 1.65, "vmax": zmax, "cell_m": cell,
        "breaks": [1.65, 1.96, 2.58],
        "legend": ["z 1.65 (90%)", "z 1.96 (95%)", "z 2.58 (99%)"],
        "note": "Gi* z-scores, burned area per 25 km cell, KNN-8 weights, analytic inference",
    })


def export_trend(nfdb, x_m, y_m):
    """Theil-Sen slope of decadal mean burned area per cell; Mann-Kendall on the annual series gates significance.

    A 50 km cell burns in only a few of the 67 years, so the annual series is
    mostly zeros and the median pairwise slope degenerates to 0; decadal means
    keep the magnitude while MK on the annual data keeps the test honest.
    """
    cell = config.TREND_CELL_M
    ny, nx = rasterout.grid_shape(cell)
    years = np.arange(config.MIN_YEAR, int(nfdb.YEAR.max()) + 1)
    cube = np.zeros((len(years), ny, nx))
    for k, y in enumerate(years):
        sel = nfdb.YEAR.values == y
        if sel.any():
            cube[k] = rasterout.bin_points(x_m[sel], y_m[sel], nfdb.SIZE_HA.values[sel], cell)

    edges = list(range(0, len(years), 10)) + [len(years)]
    centers = np.array([(years[a] + years[b - 1]) / 2 for a, b in zip(edges, edges[1:])])
    active = (cube > 0).sum(axis=0) >= 5
    slope = np.zeros((ny, nx))
    pval = np.ones((ny, nx))
    for r, c in zip(*np.nonzero(active)):
        series = cube[:, r, c]
        decadal = np.array([series[a:b].mean() for a, b in zip(edges, edges[1:])])
        slope[r, c] = stats.theilslopes(decadal, centers).slope
        pval[r, c] = stats.kendalltau(years, series).pvalue

    sig = active & (pval <= 0.1) & (slope != 0)
    smax = np.percentile(np.abs(slope[sig]), 95) if sig.any() else 1.0
    scaled = np.clip(slope / smax, -1, 1)
    px = np.zeros((ny, nx))
    px[sig] = 128 + np.sign(scaled[sig]) * np.sqrt(np.abs(scaled[sig])) * 127
    rasterout.write_png("trend", px)
    rasterout.update_meta("trend", {
        "file": "trend.png", "kind": "diverging", "encode": "signed-sqrt",
        "vmax_abs": round(float(smax), 1), "cell_m": cell,
        "legend": ["decreasing", "no significant trend", "increasing"],
        "note": "Theil-Sen slope of decadal mean burned ha per 50 km cell, Mann-Kendall on annual series p<=0.1, 1959-2025",
    })
    print(f"trend: {int(sig.sum())} significant cells of {int(active.sum())} active, smax {smax:.0f} ha/yr")


def export_reburns():
    """Count of times burned per 2 km cell from NBAC polygons."""
    import pyogrio
    from rasterio.enums import MergeAlg
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds

    cell = config.REBURN_CELL_M
    ny, nx = rasterout.grid_shape(cell)
    transform = from_bounds(config.FRAME_W, config.FRAME_S, config.FRAME_E, config.FRAME_N, nx, ny)
    counts = np.zeros((ny, nx), dtype=np.uint16)
    info = pyogrio.read_info(str(config.NBAC_SHP))
    total = info["features"]
    batch = 2000
    for start in range(0, total, batch):
        gdf = pyogrio.read_dataframe(
            str(config.NBAC_SHP), columns=["YEAR"],
            skip_features=start, max_features=batch,
        ).to_crs(config.CRS)
        counts += rasterize(
            gdf.geometry, out_shape=(ny, nx), transform=transform,
            merge_alg=MergeAlg.add, fill=0, default_value=1, dtype="uint16",
        )
    px = np.zeros((ny, nx))
    px[counts == 1] = 85
    px[counts == 2] = 170
    px[counts >= 3] = 255
    rasterout.write_png("reburns", px)
    rasterout.update_meta("reburns", {
        "file": "reburns.png", "kind": "classes", "cell_m": cell,
        "classes": [85, 170, 255],
        "legend": ["burned once", "burned twice", "burned 3+ times"],
        "note": "NBAC fire polygons rasterized and summed, 1972-2025",
    })
    burned = (counts > 0).sum() * (cell / 1000) ** 2 / 100
    print(f"reburns: {burned:.1f} Mha ever burned, max count {int(counts.max())}")


def export_layers(nfdb):
    x_m, y_m = project.to_metres(nfdb.LONGITUDE.values, nfdb.LATITUDE.values)
    export_density(nfdb, x_m, y_m)
    export_hotspots(nfdb, x_m, y_m)
    export_trend(nfdb, x_m, y_m)
    export_reburns()
