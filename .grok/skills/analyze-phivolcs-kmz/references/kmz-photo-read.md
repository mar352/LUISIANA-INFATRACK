# PHIVOLCS KMZ photo read (Luisiana)

## EIL 2014 (`Laguna_Luisiana_Earthquake_50K_2014`)

Full-sheet LatLonBox: N 14.304811 · S 14.071619 · E 121.688056 · W 121.431545.

Leaf tiles are 1024×1024. Color on the photo:

- Cream topo = not susceptible (poblacion / San Antonio / San Luis)
- Bright yellow = low susceptibility (west ridge)
- Purple specks = moderate
- Red specks = high
- Cyan diagonal hatch = deposition / runout

Sampled hazard pixels inside the municipal polygon (1884):

| Class | n | centroid |
|---|---|---|
| HIGH | 44 | 121.47696, 14.19736 |
| MODERATE | 332 | 121.48201, 14.20006 |
| LOW | 1508 | 121.48649, 14.19938 |

Those centroids sit on the **San Salvador / Ibabang Banga / Burol west ridge**, matching the yellow-purple belt on the sheet. Town proper is mostly cream.

## GSH 2014 (`Laguna_Luisiana_Ground Shaking_50K_2014`)

LatLonBox: N 14.304178 · S 14.068323 · E 121.688742 · W 121.429301.

The map face is almost entirely PEIS VIII (red). It does **not** give a local siting pattern inside Luisiana. Use as context only.

## How prediction must use this

KMZ colors = **labels**. The net must learn lon/lat + terrain → class, then paint a **predicted** grid. Do not draw only the 1884 old pixels.
