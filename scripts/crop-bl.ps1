Add-Type -AssemblyName System.Drawing
$path = "C:\Users\kingking\.gemini\antigravity-ide\brain\07078df5-05f1-4a02-9081-64bff4a12c11\sample_site_photo_1792747375042.jpg"
$b = [System.Drawing.Bitmap]::FromFile($path)
$r = New-Object System.Drawing.Rectangle(0, [int]($b.Height * 0.8), [int]($b.Width * 0.45), [int]($b.Height * 0.2))
$c = $b.Clone($r, $b.PixelFormat)
$c.Save("C:\Users\kingking\Desktop\bottom-left.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$c.Dispose()
$b.Dispose()
Write-Host "Bottom-left cropped."
