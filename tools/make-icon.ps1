$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$assets=Join-Path $root 'assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$output=Join-Path $assets 'system-controls.ico'
$master=New-Object System.Drawing.Bitmap(256,256)
$g=[System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$g.ScaleTransform(4,4)
$shape=New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(3,3,18,18,180,90)
$shape.AddArc(43,3,18,18,270,90)
$shape.AddArc(43,43,18,18,0,90)
$shape.AddArc(3,43,18,18,90,90)
$shape.CloseFigure()
$background=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,17,18,20))
$accent=[System.Drawing.Color]::FromArgb(255,255,84,10)
$outline=New-Object System.Drawing.Pen($accent,2)
$g.FillPath($background,$shape)
$g.DrawPath($outline,$shape)
$track=New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,111,119,127),3)
$track.StartCap=[System.Drawing.Drawing2D.LineCap]::Round
$track.EndCap=[System.Drawing.Drawing2D.LineCap]::Round
foreach($x in 19,32,45){$g.DrawLine($track,$x,16,$x,48)}
$knob=New-Object System.Drawing.SolidBrush($accent)
$knobEdge=New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,255,236,223),1)
foreach($pair in @(@(19,35),@(32,24),@(45,40))){$g.FillEllipse($knob,$pair[0]-5,$pair[1]-5,10,10);$g.DrawEllipse($knobEdge,$pair[0]-5,$pair[1]-5,10,10)}
$g.Dispose();$shape.Dispose();$background.Dispose();$outline.Dispose();$track.Dispose();$knob.Dispose();$knobEdge.Dispose()
$sizes=@(16,24,32,48,64,256)
$images=New-Object System.Collections.Generic.List[byte[]]
foreach($size in $sizes){
  $bitmap=New-Object System.Drawing.Bitmap($size,$size)
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.DrawImage($master,0,0,$size,$size)
  $stream=New-Object System.IO.MemoryStream
  $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
  $images.Add($stream.ToArray())
  $stream.Dispose();$graphics.Dispose();$bitmap.Dispose()
}
$master.Save((Join-Path $assets 'system-controls-preview.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()
$file=[System.IO.File]::Create($output)
$writer=New-Object System.IO.BinaryWriter($file)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$images.Count)
$offset=6+16*$images.Count
for($i=0;$i -lt $images.Count;$i++){
  $writer.Write([byte]($sizes[$i] -band 255));$writer.Write([byte]($sizes[$i] -band 255))
  $writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32)
  $writer.Write([uint32]$images[$i].Length);$writer.Write([uint32]$offset)
  $offset+=$images[$i].Length
}
foreach($data in $images){$writer.Write($data)}
$writer.Dispose()
Write-Output $output
