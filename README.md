# Atlas of Canadian Wildfires

An interactive atlas built from the Canadian National Fire Database: 20,946 fires of 200 hectares
or more, 1959–2025, about 160 million hectares burned.

## What's on the page

- A canvas map (d3) that replays all 66 years as embers with a scrubbable timeline. Drag to
  pan; ctrl+scroll or pinch to zoom.
- Explorable statistical layers: kernel **density** of burned area, Getis–Ord Gi\*
  **hotspots**, Theil–Sen/Mann–Kendall **trend**, NBAC **reburn** counts, and
  CanLaBS Landsat burn **severity**.
- **2023 day by day** — 1.6 million VIIRS thermal detections replayed across the
  record year.
- A d3 editorial below: annual record, era mean sizes, cause shares (doubles as a
  map scrubber), province small multiples, and the twenty largest fires.

## How it works

Python (in `SCRIPTS/`) does all the computation and writes compact assets
into `assets/`; the browser recomputes nothing. Everything shares one map
frame (the CanLaBS raster's NAD83 Canada Lambert grid) so statistical rasters
land on the map with no registration work in JS. The site itself is static
files written in vanilla html,css and js with an ES-module import map (d3 from CDN); there is no build step.

## Data sources

- Canadian National Fire Database (NFDB) point data & National Burned Area
- Composite (NBAC)
- CWFIS / Canadian Forest Service, Natural Resources Canada
  CanLaBS Landsat burn severity
- FIRMS VIIRS active fire data, NASA
  LANCE/FIRMS
- basemap: Natural Earth.
