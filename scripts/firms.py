import export
import numpy as np
import pandas as pd

import clean
import config
import project
import rasterout


def export_firms():
    """Aggregate 2023 VIIRS detections to (day, 6 km cell) triplets in a Uint16 stream."""
    df = clean.load_firms()
    x_m, y_m = project.to_metres(df.LONGITUDE.values, df.LATITUDE.values)
    cell = config.FIRMS_CELL_M
    ny, nx = rasterout.grid_shape(cell)
    cx = np.clip(((x_m - config.FRAME_W) / cell).astype(int), 0, nx - 1)
    cy = np.clip(((config.FRAME_N - y_m) / cell).astype(int), 0, ny - 1)

    agg = pd.DataFrame({"doy": df.doy, "cx": cx, "cy": cy, "frp": df.FRP})
    rows = agg.groupby(["doy", "cx", "cy"]).agg(n=("frp", "size"), frp=("frp", "sum")).reset_index()
    rows = rows.sort_values(["doy", "cx", "cy"]).reset_index(drop=True)

    stream = np.empty(len(rows) * 3, dtype=np.uint16)
    stream[0::3] = rows.cx
    stream[1::3] = rows.cy
    stream[2::3] = rows.n.clip(0, 65535)
    (config.ASSETS / "firms2023.bin").write_bytes(stream.tobytes())

    counts = rows.groupby("doy").size().reindex(range(1, 366), fill_value=0)
    day_index = [0] * 367
    cum = 0
    for d in range(1, 366):
        day_index[d] = cum
        cum += int(counts[d])
    day_index[366] = cum

    daily_count = [0] * 366
    daily_frp = [0] * 366
    per_day = df.groupby("doy")
    for doy, n in per_day.size().items():
        daily_count[int(doy)] = int(n)
    for doy, s in per_day.FRP.sum().items():
        daily_frp[int(doy)] = int(round(s))

    export.write_json(config.ASSETS / "firms2023.json", {
        "grid": {"nx": nx, "ny": ny, "cell_m": cell},
        "rows": len(rows),
        "dayIndex": day_index,
        "dailyCount": daily_count,
        "dailyFRP": daily_frp,
        "note": "VIIRS SNPP C2 2023, TYPE=0, confidence>=nominal; triplets (cx, cy, count) per day",
    })
    size = (config.ASSETS / "firms2023.bin").stat().st_size / 1e6
    print(f"firms: {len(rows)} day-cells, bin {size:.2f} MB")
