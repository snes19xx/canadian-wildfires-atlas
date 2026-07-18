import json

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.ops import unary_union

import config
import project


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"wrote {path.relative_to(config.ROOT)} ({path.stat().st_size / 1e6:.2f} MB)")


def _rings(geom, min_span=0.004):
    """Yield projected scene-space vertex lists for polygon exterior rings."""
    polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    for p in polys:
        lon, lat = zip(*p.exterior.coords)
        u, v = project.to_scene(np.array(lon), np.array(lat))
        if u.max() - u.min() < min_span and v.max() - v.min() < min_span:
            continue
        yield [[round(float(a), 4), round(float(b), 4)] for a, b in zip(u, v)]


def export_basemap():
    gdf = gpd.read_file(config.PROVINCES_SHP)
    admin_col = "admin" if "admin" in gdf.columns else "ADMIN"
    can = gdf[gdf[admin_col] == "Canada"]
    postal_col = "postal" if "postal" in can.columns else "abbrev"
    provinces = []
    simplified = can.geometry.simplify(0.05)
    for (_, row), geom in zip(can.iterrows(), simplified):
        provinces.append({"id": str(row[postal_col]), "rings": list(_rings(geom))})
    outline = list(_rings(unary_union(list(simplified)), min_span=0.008))
    write_json(config.ASSETS / "basemap.json", {"provinces": provinces, "outline": outline})


def export_fires(nfdb):
    u, v = project.to_scene(nfdb.LONGITUDE.values, nfdb.LATITUDE.values)
    named = {}
    for i, r in enumerate(nfdb.itertuples()):
        label = str(r.FIRENAME).strip()
        if r.SIZE_HA >= 100_000 and label and label.lower() != "nan":
            named[str(i)] = label
    year_index = {}
    years = nfdb.YEAR.values
    for y in range(config.MIN_YEAR, int(years.max()) + 1):
        idx = np.flatnonzero(years == y)
        if len(idx):
            year_index[str(y)] = [int(idx[0]), int(idx[-1]) + 1]
    obj = {
        "meta": {
            "n": len(nfdb),
            "years": [config.MIN_YEAR, int(years.max())],
            "source": "NFDB_point_20260529_large_fires",
        },
        "x": [round(float(a), 4) for a in u],
        "y": [round(float(b), 4) for b in v],
        "ha": nfdb.SIZE_HA.round().astype(int).tolist(),
        "year": nfdb.YEAR.astype(int).tolist(),
        "month": nfdb.MONTH.astype(int).tolist(),
        "cause": nfdb.cause.tolist(),
        "t": nfdb.t.round(3).tolist(),
        "name": named,
        "yearIndex": year_index,
    }
    write_json(config.ASSETS / "fires.json", obj)


def export_annual(nfdb, nbac):
    years = list(range(config.MIN_YEAR, int(nfdb.YEAR.max()) + 1))
    by_year = nfdb.groupby("YEAR")
    fires_n = by_year.size().reindex(years, fill_value=0)
    fires_ha = by_year.SIZE_HA.sum().reindex(years, fill_value=0.0)

    cause_ha = {}
    for code, cid in config.CAUSE_CODE.items():
        s = nfdb[nfdb.cause == cid].groupby("YEAR").SIZE_HA.sum().reindex(years, fill_value=0.0)
        cause_ha[code] = [round(x) for x in s]

    province_ha = {}
    for ag in sorted(nfdb.SRC_AGENCY.str.strip().unique()):
        s = (
            nfdb[nfdb.SRC_AGENCY.str.strip() == ag]
            .groupby("YEAR").SIZE_HA.sum().reindex(years, fill_value=0.0)
        )
        province_ha[ag] = [round(x) for x in s]

    era = pd.cut(nfdb.YEAR, config.ERA_BINS, labels=config.ERA_LABELS)
    era_mean = nfdb.groupby(era, observed=True).SIZE_HA.mean().round().astype(int)

    top = nfdb.nlargest(20, "SIZE_HA")
    top_fires = [
        {
            "rank": k + 1,
            "year": int(r.YEAR),
            "agency": r.SRC_AGENCY.strip(),
            "ha": int(round(r.SIZE_HA)),
            "name": str(r.FIRENAME).strip() if str(r.FIRENAME).strip().lower() not in ("", "nan") else "",
            "i": int(r.Index),
        }
        for k, r in enumerate(top.itertuples())
    ]

    obj = {
        "years": years,
        "nfdb": {"fires": fires_n.tolist(), "ha": [round(x) for x in fires_ha]},
        "nbac": {
            "years": nbac.YEAR.tolist(),
            "ha_adj": [round(float(x)) if pd.notna(x) else 0 for x in nbac.CANADA],
        },
        "cause_ha": cause_ha,
        "province_ha": province_ha,
        "era_mean_size": {k: int(v) for k, v in era_mean.items()},
        "top_fires": top_fires,
    }
    write_json(config.ASSETS / "annual.json", obj)
    return fires_ha


def export_core(nfdb, nbac):
    export_basemap()
    export_fires(nfdb)
    return export_annual(nfdb, nbac)
