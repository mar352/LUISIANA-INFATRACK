Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\kingking\.gemini\antigravity-ide\brain\07078df5-05f1-4a02-9081-64bff4a12c11\sample_site_photo_1792747375042.jpg"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source file not found: $srcPath"
    exit 1
}

$bmpBytes = [System.IO.File]::ReadAllBytes($srcPath)
$ms = New-Object System.IO.MemoryStream(,$bmpBytes)
$bmp = [System.Drawing.Bitmap]::FromStream($ms)

$width = $bmp.Width
$height = $bmp.Height

# Banner height: 280px
$bannerHeight = 280
$bannerY = $height - $bannerHeight

$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# Draw solid white background banner
$brushBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.FillRectangle($brushBg, 0, $bannerY, $width, $bannerHeight)

# Top accent bar (Luisiana Blue)
$brushAccentTop = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 113, 227))
$graphics.FillRectangle($brushAccentTop, 0, $bannerY, $width, 6)

# Left accent bar (Dark Blue)
$brushAccentLeft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 80, 180))
$graphics.FillRectangle($brushAccentLeft, 0, $bannerY, 18, $bannerHeight)

# Fonts
$fontTitle = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
$fontCoords = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
$fontMeta = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Regular)

# Brushes
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 113, 227))
$brushBlack = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$brushDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 71, 85, 105))

$startX = 36
$curY = $bannerY + 18

$graphics.DrawString("GPS MAP CAMERA - LUISIANA INFA-TRACK", $fontTitle, $brushBlue, $startX, $curY)
$curY += 40

$graphics.DrawString("Latitude: 14.183700 N", $fontCoords, $brushBlack, $startX, $curY)
$curY += 46

$graphics.DrawString("Longitude: 121.508900 E", $fontCoords, $brushBlack, $startX, $curY)
$curY += 46

$graphics.DrawString("Barangay: Barangay Zone I (Poblacion), Luisiana, Laguna", $fontMeta, $brushBlack, $startX, $curY)
$curY += 40

$graphics.DrawString("Elevation: 120.5m | Accuracy: 1.2m | 2026-10-23 15:30:12 GMT+08:00", $fontMeta, $brushDark, $startX, $curY)

$graphics.Dispose()

# Save with watermark
$destGeotagged = "C:\Users\kingking\Desktop\sample-geotagged-site-photo.jpg"
$destNoExif = "C:\Users\kingking\Desktop\sample-watermark-no-exif.jpg"
$destFrontend = "c:\Users\kingking\Desktop\LUISIANA-INFATRACK-master\frontend\images\sample-geotagged-site-photo.jpg"
$destFrontendNoExif = "c:\Users\kingking\Desktop\LUISIANA-INFATRACK-master\frontend\images\sample-watermark-no-exif.jpg"

$tempPath = "C:\Users\kingking\Desktop\temp-watermark-saved.jpg"
$bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
$ms.Dispose()

Copy-Item -Path $tempPath -Destination $destNoExif -Force
Copy-Item -Path $tempPath -Destination $destFrontendNoExif -Force
Copy-Item -Path $tempPath -Destination $destGeotagged -Force
Copy-Item -Path $tempPath -Destination $destFrontend -Force

Remove-Item $tempPath
Write-Host "Watermarked images successfully created at:"
Write-Host "  - $destGeotagged"
Write-Host "  - $destNoExif"
Write-Host "  - $destFrontend"
Write-Host "  - $destFrontendNoExif"
