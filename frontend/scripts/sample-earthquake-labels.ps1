# Walk PHIVOLCS EIL-2014 tiles using each tile's KMZ LatLonBox.
# Keep only pixels that are real hazard colors (yellow / purple / red / hatch).
# Clip to the Luisiana municipal polygon. Writes luisiana-earthquake-labels.csv
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "public\data\luisiana-earthquake-labels.csv"
$eilManifest = Join-Path $root "public\hazards\eil-2014\tiles\tiles.json"
$gshManifest = Join-Path $root "public\hazards\gsh-2014\tiles\tiles.json"
$boundaryPath = Join-Path $root "public\data\luisiana-boundary.geojson"

function Read-Tiles($manifestPath) {
  $json = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
  $tiles = @()
  foreach ($t in $json.tiles) {
    $rel = $t.url -replace "^/", ""
    $file = Join-Path $root ("public\" + ($rel -replace "/", "\"))
    if (-not (Test-Path $file)) { continue }
    $bmp = [System.Drawing.Bitmap]::FromFile($file)
    $tiles += [pscustomobject]@{
      West = [double]$t.rectangle.west
      South = [double]$t.rectangle.south
      East = [double]$t.rectangle.east
      North = [double]$t.rectangle.north
      Bmp = $bmp
    }
  }
  return $tiles
}

$ring = @()
if (Test-Path $boundaryPath) {
  $geo = Get-Content -Raw -Path $boundaryPath | ConvertFrom-Json
  $ring = $geo.features[0].geometry.coordinates[0]
}

function Test-InsideLuisiana([double]$lon, [double]$lat) {
  if ($ring.Count -lt 4) { return $true }
  $inside = $false
  $j = $ring.Count - 1
  for ($i = 0; $i -lt $ring.Count; $i++) {
    $xi = [double]$ring[$i][0]; $yi = [double]$ring[$i][1]
    $xj = [double]$ring[$j][0]; $yj = [double]$ring[$j][1]
    if ((($yi -gt $lat) -ne ($yj -gt $lat))) {
      $xint = (($xj - $xi) * ($lat - $yi) / (($yj - $yi) + 1e-18)) + $xi
      if ($lon -lt $xint) { $inside = -not $inside }
    }
    $j = $i
  }
  return $inside
}

function Classify-EilPixel($px) {
  if ($px.A -lt 40) { return $null }
  # cream / paper / contours-light
  if ($px.R -gt 220 -and $px.G -gt 205 -and $px.B -gt 180) { return $null }
  # black roads / text
  if ($px.R -lt 55 -and $px.G -lt 55 -and $px.B -lt 55) { return $null }
  # brown contour lines
  if ($px.R -gt 140 -and $px.R -lt 210 -and $px.G -gt 80 -and $px.G -lt 160 -and $px.B -lt 90 -and ($px.R - $px.B) -gt 50 -and ($px.R - $px.G) -lt 80) { return $null }
  # stream blue
  if ($px.B -gt 160 -and $px.G -gt 140 -and $px.R -lt 120) { return $null }
  # yellow = low susceptibility (dominant EIL fill)
  if ($px.R -gt 185 -and $px.G -gt 165 -and $px.B -lt 95 -and ($px.R - $px.B) -gt 80) { return "low" }
  # red = high
  if ($px.R -gt 155 -and $px.G -lt 95 -and $px.B -lt 95 -and ($px.R - $px.G) -gt 55) { return "high" }
  # purple = moderate
  if ($px.R -gt 95 -and $px.B -gt 105 -and $px.G -lt 105 -and ($px.B - $px.G) -gt 25) { return "moderate" }
  # cyan/green hatch = deposition / runout
  if ($px.G -gt 145 -and $px.B -gt 140 -and $px.R -lt 150 -and ($px.G - $px.R) -gt 20) { return "runout" }
  return $null
}

function Combine($eil) {
  if ($eil -eq "high") { return "HIGH" }
  if ($eil -eq "moderate" -or $eil -eq "runout") { return "MODERATE" }
  if ($eil -eq "low") { return "LOW" }
  return $null
}

Write-Host "Loading EIL-2014 tiles (KMZ LatLonBox)..."
$eilTiles = Read-Tiles $eilManifest
Write-Host ("EIL tiles: {0}" -f $eilTiles.Count)

# Luisiana bbox from ring, with small pad, so we skip far tiles quickly
$munW = 121.466; $munS = 14.148; $munE = 121.616; $munN = 14.224

$stepPx = 10
$rows = New-Object System.Collections.Generic.List[string]
$rows.Add("lat,lon,shakeClass,eilClass,label,source") | Out-Null
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$kept = 0

foreach ($tile in $eilTiles) {
  if ($tile.East -lt $munW -or $tile.West -gt $munE -or $tile.North -lt $munS -or $tile.South -gt $munN) {
    continue
  }
  $w = $tile.Bmp.Width
  $h = $tile.Bmp.Height
  Write-Host ("  sampling {0}x{1}  W{2:F4}..{3:F4}  S{4:F4}..{5:F4}" -f $w, $h, $tile.West, $tile.East, $tile.South, $tile.North)
  for ($y = 0; $y -lt $h; $y += $stepPx) {
    for ($x = 0; $x -lt $w; $x += $stepPx) {
      $px = $tile.Bmp.GetPixel($x, $y)
      $eilc = Classify-EilPixel $px
      if (-not $eilc) { continue }
      $u = $x / [double]($w - 1)
      $v = $y / [double]($h - 1)
      $lon = $tile.West + $u * ($tile.East - $tile.West)
      $lat = $tile.North - $v * ($tile.North - $tile.South)
      if (-not (Test-InsideLuisiana $lon $lat)) { continue }
      $key = ("{0:F4},{1:F4}" -f $lat, $lon)
      if (-not $seen.Add($key)) { continue }
      $label = Combine $eilc
      if (-not $label) { continue }
      # GSH for Luisiana is PEIS VIII across the sheet — record it, don't invent local variation
      $rows.Add(("{0:F5},{1:F5},viii,{2},{3},eil-2014-kmz" -f $lat, $lon, $eilc, $label)) | Out-Null
      $kept++
    }
  }
}

[System.IO.File]::WriteAllLines($outPath, $rows)
foreach ($t in $eilTiles) { $t.Bmp.Dispose() }
Write-Host "Wrote $kept KMZ-aligned hazard points -> $outPath"
