# Digitized hazard labels

`luisiana-hazard-labels.csv` trains the AI Risk model.

## Columns

```text
lat,lon,label,type,source
14.185,121.51,0,safe,manual
14.20,121.54,1,landslide,manual
```

- `label`: `1` = hazard, `0` = safe
- `type`: `landslide` | `flood` | `safe` | …

## Replace with your own points

1. Open the EIL KMZs in Google Earth.
2. Digitize hazard + safe placemarks (aim for 80–150+ balanced points).
3. Export CSV or KML to this folder as `luisiana-hazard-labels.csv` or `.kml`.
4. Hard-refresh the app (or clear site data) so the model retrains under `luisiana-risk-model-v2-digitized`.

The starter CSV was sampled from colored/hatched zones on the official Luisiana EIL KMZ map images when LGU vector GIS was unavailable.
