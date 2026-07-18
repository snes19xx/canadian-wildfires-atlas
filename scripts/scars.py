import json

import numpy as np
import pyogrio

import config
import export
import project


def _scene_rings(geom, min_span=0.002):
    polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    for p in polys:
        x, y = zip(*p.exterior.coords)
        u, v = project.metres_to_scene(np.array(x), np.array(y))
        if u.max() - u.min() < min_span and v.max() - v.min() < min_span:
            continue
        yield [[round(float(a), 4), round(float(b), 4)] for a, b in zip(u, v)]


def export_scars():
    """Simplified NBAC polygons >= SCAR_MIN_HA, top-20 NFDB fires matched by point-in-polygon."""
    gdf = pyogrio.read_dataframe(
        str(config.NBAC_SHP), columns=["YEAR", "POLY_HA"],
        where=f"POLY_HA >= {config.SCAR_MIN_HA}",
    ).to_crs(config.CRS)
    print(f"scars: {len(gdf)} polygons >= {config.SCAR_MIN_HA} ha")

    annual = json.loads((config.ASSETS / "annual.json").read_text())
    fires = json.loads((config.ASSETS / "fires.json").read_text())
    top_pts = {}
    for tf in annual["top_fires"]:
        i = tf["i"]
        x = fires["x"][i] * (config.FRAME_E - config.FRAME_W) + config.FRAME_W
        y = fires["y"][i] * (config.FRAME_N - config.FRAME_S) + config.FRAME_S
        top_pts[tf["rank"]] = (tf["year"], x, y)

    from shapely.geometry import Point

    sindex = gdf.sindex
    rank_by_row = {}
    for rank, (year, x, y) in top_pts.items():
        pt = Point(x, y)
        for j in sindex.query(pt.buffer(20_000)):
            row = gdf.iloc[j]
            if int(row.YEAR) == year and row.geometry.buffer(0).distance(pt) < 15_000:
                rank_by_row[gdf.index[j]] = rank
                break

    feats = []
    for idx, row in gdf.iterrows():
        rank = rank_by_row.get(idx)
        if not rank and row.POLY_HA < config.SCAR_KEEP_HA:
            continue
        tol = 250 if rank else 1000
        geom = row.geometry.simplify(tol)
        rings = list(_scene_rings(geom))
        if not rings:
            continue
        f = {"year": int(row.YEAR), "ha": int(row.POLY_HA), "rings": rings}
        if rank:
            f["rank"] = rank
        feats.append(f)

    matched = sorted(f["rank"] for f in feats if "rank" in f)
    print(f"scars: matched top-20 ranks {matched}")
    export.write_json(config.ASSETS / "scars.json", {"fires": feats})
