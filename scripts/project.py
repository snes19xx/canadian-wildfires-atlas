import config
import numpy as np
from pyproj import Transformer

_tx = Transformer.from_crs("EPSG:4326", config.CRS, always_xy=True)


def to_metres(lon, lat):
    """Project lon/lat arrays to frame metres."""
    return _tx.transform(np.asarray(lon), np.asarray(lat))


def metres_to_scene(x, y):
    """Normalize frame metres to [0,1]² scene coords (v grows north)."""
    u = (np.asarray(x) - config.FRAME_W) / (config.FRAME_E - config.FRAME_W)
    v = (np.asarray(y) - config.FRAME_S) / (config.FRAME_N - config.FRAME_S)
    return u, v


def to_scene(lon, lat):
    return metres_to_scene(*to_metres(lon, lat))
