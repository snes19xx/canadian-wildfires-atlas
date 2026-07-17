import config
import numpy as np
import pandas as pd


def _ignite_time(row, i):
    """Calculate ignition time as a fractional year."""
    if row.MONTH >= 1:
        doy = (row.MONTH - 1) * 30.4 + (row.DAY if row.DAY >= 1 else 15)
        return row.YEAR + min(doy / 365.0, 0.99)
    return row.YEAR + 0.35 + 0.4 * ((i * 2654435761) % 1000) / 1000.0


def load_nfdb():
    """Return cleaned NFDB large-fires frame sorted by ignition time."""
    df = pd.read_csv(config.NFDB_TXT, encoding="utf-8-sig", low_memory=False)
    n_raw = len(df)
    df = df[df.YEAR >= config.MIN_YEAR].copy()
    n_year = len(df)
    df["PRESCRIBED"] = df.PRESCRIBED.fillna("").str.strip().str.upper()
    df = df[df.PRESCRIBED != "Y"]
    df["CAUSE22"] = df.CAUSE22.fillna("U").str.strip().replace("", "U")
    df["cause"] = df.CAUSE22.map(config.CAUSE_CODE).fillna(2).astype(int)
    df["MONTH"] = df.MONTH.clip(0, 12)
    df = df.reset_index(drop=True)
    df["t"] = [_ignite_time(r, i) for i, r in enumerate(df.itertuples())]
    df = df.sort_values("t").reset_index(drop=True)
    print(f"NFDB: {n_raw} raw -> {n_year} >= {config.MIN_YEAR} -> {len(df)} after prescribed filter")
    assert 20_500 <= len(df) <= 21_650
    return df

def load_nbac_annual():
    """Return NBAC adjusted-ha per year (national + per admin), ascending years."""
    s = pd.read_excel(config.NBAC_XLSX, sheet_name="sumstats_admin_name", skiprows=2)
    s = s[pd.to_numeric(s.YEAR, errors="coerce").notna()].copy()
    s["YEAR"] = s.YEAR.astype(int)
    for c in s.columns[1:]:
        s[c] = pd.to_numeric(s[c], errors="coerce")
    s = s.sort_values("YEAR").reset_index(drop=True)
    assert s.YEAR.min() == 1972 and s.YEAR.max() == 2025
    return s

def load_firms():
    """Return 2023 VIIRS detections (vegetation fires, confidence >= nominal)."""
    import pyogrio

    df = pyogrio.read_dataframe(
        config.FIRMS_SHP,
        columns=["LATITUDE", "LONGITUDE", "ACQ_DATE", "FRP", "CONFIDENCE", "TYPE"],
        read_geometry=False,
    )
    n_raw = len(df)
    df = df[(df.TYPE == 0) & (df.CONFIDENCE != "l")].copy()
    df["doy"] = pd.to_datetime(df.ACQ_DATE).dt.dayofyear.astype(int)
    print(f"FIRMS: {n_raw} raw -> {len(df)} kept")
    assert 1_200_000 <= len(df) <= 1_754_727
    return df.reset_index(drop=True)