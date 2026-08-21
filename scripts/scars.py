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
    fires = export.read_fires()
    top_pts = {}
    for tf in annual["top_fires"]:
        i = tf["i"]
        x = fires["x"][i] * (config.FRAME_E - config.FRAME_W) + config.FRAME_W
        y = fires["y"][i] * (config.FRAME_N - config.FRAME_S) + config.FRAME_S
        top_pts[tf["rank"]] = (tf["year"], x, y, tf["ha"])

    from shapely.geometry import Point

    sindex = gdf.sindex
    rank_by_row = {}
    for rank, (year, x, y, ha) in top_pts.items():
        pt = Point(x, y)
        cands = []
        for j in sindex.query(pt.buffer(30_000)):
            row = gdf.iloc[j]
            if int(row.YEAR) != year:
                continue
            geom = row.geometry.buffer(0)
            d = geom.distance(pt)
            if d < 20_000 and 0.4 < row.POLY_HA / ha < 2.5:
                cands.append((0 if geom.contains(pt) else 1, d, gdf.index[j]))
        if cands:
            rank_by_row[min(cands)[2]] = rank

    feats = []
    for idx, row in gdf.iterrows():
        rank = rank_by_row.get(idx)
        if not rank:
            continue
        rings = list(_scene_rings(row.geometry.simplify(250)))
        if not rings:
            continue
        feats.append(
            {"year": int(row.YEAR), "ha": int(row.POLY_HA), "rings": rings, "rank": rank}
        )

    feats.sort(key=lambda f: f["rank"])
    missing = sorted(set(top_pts) - {f["rank"] for f in feats})
    print(f"scars: matched {len(feats)}/{len(top_pts)} top fires" + (f", missing {missing}" if missing else ""))
    export.write_json(config.ASSETS / "scars.json", {"fires": feats})
