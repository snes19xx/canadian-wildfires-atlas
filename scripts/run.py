import sys

import clean
import config
import export


def verify(nfdb, nbac, fires_ha):
    """Cross-check exports against NFDB_point_stats.xlsx reference values."""
    expected_nfdb = {2023: 17.569, 2024: 5.340, 2025: 8.405}
    expected_nbac = {2023: 14.796, 2024: 4.918, 2025: 7.308}
    nbac_by_year = dict(zip(nbac.YEAR, nbac.CANADA))
    print("\nyear   NFDB Mha  (expect)   NBAC Mha  (expect)")
    ok = True
    for y in (2023, 2024, 2025):
        got_n = fires_ha[y] / 1e6
        got_b = nbac_by_year[y] / 1e6
        ok &= abs(got_n - expected_nfdb[y]) < 0.01 and abs(got_b - expected_nbac[y]) < 0.01
        print(f"{y}   {got_n:8.3f}  ({expected_nfdb[y]:.3f})   {got_b:8.3f}  ({expected_nbac[y]:.3f})")
    print("verification:", "PASS" if ok else "FAIL")
    if not ok:
        sys.exit(1)


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    nfdb = clean.load_nfdb()
    nbac = clean.load_nbac_annual()
    fires_ha = export.export_core(nfdb, nbac)
    verify(nfdb, nbac, fires_ha)
    if stage == "all":
        import analysis
        import firms
        import scars
        import severity

        analysis.export_layers(nfdb)
        severity.export_severity()
        scars.export_scars()
        firms.export_firms()


if __name__ == "__main__":
    main()
