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


def pack_fires(u, v, ha, t, year0, year1):
    """Header (4 x uint32) + int16 x, int16 y, uint16 t-deltas, uint32 ha."""
    n = len(u)
    xq = np.rint(np.asarray(u, dtype=np.float64) * 1e4).astype(np.int16)
    yq = np.rint(np.asarray(v, dtype=np.float64) * 1e4).astype(np.int16)
    tq = np.rint((np.asarray(t, dtype=np.float64) - year0) * 1e3).astype(np.int64)
    if np.any(np.diff(tq) < 0):
        raise ValueError("fires must be sorted by t")
    dt = np.empty(n, dtype=np.uint16)
    dt[0] = tq[0]
    dt[1:] = np.diff(tq)
    haq = np.rint(np.asarray(ha, dtype=np.float64)).astype(np.uint32)

    head = np.array([n, year0, year1, 0], dtype=np.uint32)
    body = xq.tobytes() + yq.tobytes() + dt.tobytes()
    body += b"\x00" * (-len(body) % 4)
    return head.tobytes() + body + haq.tobytes()


def read_fires():
    """Read back what pack_fires wrote: scene x, y, hectares and t."""
    blob = (config.ASSETS / "fires.bin").read_bytes()
    n, year0, _, _ = np.frombuffer(blob, np.uint32, 4)
    n = int(n)
    o = 16
    x = np.frombuffer(blob, np.int16, n, o) / 1e4
    o += 2 * n
    y = np.frombuffer(blob, np.int16, n, o) / 1e4
    o += 2 * n
    dt = np.frombuffer(blob, np.uint16, n, o)
    o += 2 * n
    o += -o % 4
    ha = np.frombuffer(blob, np.uint32, n, o)
    t = int(year0) + np.cumsum(dt.astype(np.int64)) / 1e3
    return {"x": x, "y": y, "ha": ha, "t": t}


def export_fires(nfdb):
    u, v = project.to_scene(nfdb.LONGITUDE.values, nfdb.LATITUDE.values)
    years = nfdb.YEAR.values
    blob = pack_fires(
        np.round(u, 4),
        np.round(v, 4),
        nfdb.SIZE_HA.values,
        nfdb.t.round(3).values,
        config.MIN_YEAR,
        int(years.max()),
    )
    path = config.ASSETS / "fires.bin"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    print(f"wrote {path.relative_to(config.ROOT)} ({len(blob) / 1e6:.2f} MB, {len(nfdb)} fires)")


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
