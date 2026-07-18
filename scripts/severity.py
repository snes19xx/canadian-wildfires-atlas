import numpy as np
import rasterio

import config
import rasterout


def export_severity():
    """CanLaBS dNBR classes at ~1.5 km, nearest-sampled from the 30 m raster."""
    with rasterio.open(config.CANLABS_TIF) as src:
        a = src.read(1, out_shape=config.SEVERITY_SHAPE)
        nodata = src.nodata
    px = np.zeros(config.SEVERITY_SHAPE)
    valid = (a != nodata) & (a > 0)
    px[valid & (a < 270)] = 85
    px[valid & (a >= 270) & (a <= 660)] = 170
    px[valid & (a > 660)] = 255
    rasterout.write_png("severity", px)
    fracs = [round(float((px == v).sum() / max(valid.sum(), 1)), 3) for v in (85, 170, 255)]
    rasterout.update_meta("severity", {
        "file": "severity.png", "kind": "classes",
        "classes": [85, 170, 255],
        "legend": ["low severity", "moderate", "high severity"],
        "note": "CanLaBS 1985-2024 dNBR (x1000), classes <270 / 270-660 / >660, nearest-sampled",
        "class_fracs": fracs,
    })
    print(f"severity: class fractions {fracs}")
