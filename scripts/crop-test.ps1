Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('C:\Users\kingking\Desktop\sample-watermark-no-exif.jpg')
$h = $bmp.Height
$w = $bmp.Width
$bannerHeight = [int]($h * 0.32)
$bannerY = $h - $bannerHeight
$rect = New-Object System.Drawing.Rectangle(0, $bannerY, $w, $bannerHeight)
$crop = $bmp.Clone($rect, $bmp.PixelFormat)
$crop.Save('C:\Users\kingking\Desktop\test-crop.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$crop.Dispose()
$bmp.Dispose()
Write-Host 'Cropped bottom saved.'
