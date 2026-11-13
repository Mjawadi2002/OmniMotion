# Finds faces in still images with the face detector built into Windows (Windows.Media.FaceAnalysis). Nothing is installed or sent anywhere.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File faces.ps1 <image> [<image> ...]
# Prints one JSON line per image: {"file": ..., "w": ..., "h": ..., "faces": [{"x","y","w","h"}]}
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.FaceAnalysis.FaceDetector, Windows.Media.FaceAnalysis, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.FaceAnalysis.DetectedFace, Windows.Media.FaceAnalysis, ContentType = WindowsRuntime] | Out-Null

$detector = Await ([Windows.Media.FaceAnalysis.FaceDetector]::CreateAsync()) ([Windows.Media.FaceAnalysis.FaceDetector])
foreach ($p in $args) {
  try {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync([System.IO.Path]::GetFullPath($p))) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $gray = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Gray8)
    $faces = Await ($detector.DetectFacesAsync($gray)) ([System.Collections.Generic.IList[Windows.Media.FaceAnalysis.DetectedFace]])
    $list = @($faces | ForEach-Object { '{"x":' + $_.FaceBox.X + ',"y":' + $_.FaceBox.Y + ',"w":' + $_.FaceBox.Width + ',"h":' + $_.FaceBox.Height + '}' })
    $stream.Dispose()
    Write-Output ('{"file":' + (ConvertTo-Json $p -Compress) + ',"w":' + $gray.PixelWidth + ',"h":' + $gray.PixelHeight + ',"faces":[' + ($list -join ',') + ']}')
  } catch {
    Write-Output ('{"file":' + (ConvertTo-Json $p -Compress) + ',"error":' + (ConvertTo-Json ([string]$_.Exception.Message) -Compress) + '}')
  }
}
