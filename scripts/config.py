from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NFDB_TXT = ROOT / "NFDB_point_large_fires_txt/NFDB_point_20260529_large_fires.txt"
NBAC_XLSX = ROOT / "NBAC_summarystats_1972_to_2025_20260513.xlsx"
NBAC_SHP = ROOT / "Natural_earth/NBAC_1972to2025_20260513_shp/NBAC_merged_1972_to_2025_20260513.shp"
CANLABS_TIF = ROOT / "CanLaBS_1985_2024_v20260121.tif"
FIRMS_SHP = ROOT / "DL_FIRE_SV-C2_774596/fire_archive_SV-C2_774596.shp"
PROVINCES_SHP = ROOT / "Natural_earth/ne_50m_admin_1_states_provinces.shp"

ASSETS = ROOT / "WEB/assets"
LAYERS = ASSETS / "layers"

MIN_YEAR = 1959

# CanLaBS CRS; every dataset projects into this frame so textures align by construction.
CRS = "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=0 +lon_0=-95 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs"
FRAME_W, FRAME_S, FRAME_E, FRAME_N = -2341500.0, 5863500.0, 3010500.0, 9436500.0
FRAME_ASPECT = (FRAME_E - FRAME_W) / (FRAME_N - FRAME_S)

CAUSE_CODE = {"N": 0, "H": 1, "U": 2}

ERA_BINS = [1959, 1980, 2000, 2015, 2025]
ERA_LABELS = ["1960-80", "1981-2000", "2001-15", "2016-25"]

DENSITY_CELL_M = 5_000
HOTSPOT_CELL_M = 25_000
TREND_CELL_M = 50_000
REBURN_CELL_M = 2_000
FIRMS_CELL_M = 6_000
SCAR_MIN_HA = 25_000
SCAR_KEEP_HA = 100_000
SEVERITY_SHAPE = (1191, 1784)
