import json

import numpy as np
import rasterio

import config


def grid_shape(cell_m):
    ny = round((config.FRAME_N - config.FRAME_S) / cell_m)
    nx = round((config.FRAME_E - config.FRAME_W) / cell_m)
    return ny, nx


def bin_points(x_m, y_m, weights, cell_m):
    """Histogram points into the frame grid, row 0 = north."""
    ny, nx = grid_shape(cell_m)
    h, _, _ = np.histogram2d(
        y_m, x_m, bins=[ny, nx],
        range=[[config.FRAME_S, config.FRAME_N], [config.FRAME_W, config.FRAME_E]],
        weights=weights,
    )
    return np.flipud(h)


def write_png(name, arr):
    path = config.LAYERS / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    ny, nx = arr.shape
    with rasterio.open(path, "w", driver="PNG", width=nx, height=ny, count=1, dtype="uint8") as dst:
        dst.write(arr.astype(np.uint8), 1)
    for aux in config.LAYERS.glob(f"{name}.png.aux.xml"):
        aux.unlink()
    print(f"wrote {path.relative_to(config.ROOT)} ({path.stat().st_size / 1e6:.2f} MB)")


def update_meta(name, meta):
    path = config.LAYERS / "layers.json"
    data = json.loads(path.read_text()) if path.exists() else {}
    data[name] = meta
    path.write_text(json.dumps(data, separators=(",", ":")))
