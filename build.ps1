$OutputName = if ($args.Count -gt 0) { $args[0] } else { 'SystemAccessibilityUi.exe' }
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root 'dist'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler was not found.' }
$sdk = Join-Path $root 'vendor\webview2'
if (-not (Test-Path -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
  $vendor = Join-Path $root 'vendor'
  New-Item -ItemType Directory -Path $vendor -Force | Out-Null
  $package = Join-Path $vendor 'webview2.nupkg'
  Invoke-WebRequest -Uri 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg' -OutFile $package
  Expand-Archive -LiteralPath $package -DestinationPath $sdk -Force
}
$exe = Join-Path $out $OutputName
$manifest = Join-Path $root 'app.manifest'
$icon = Join-Path $root 'assets\system-controls.ico'
$core = Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$forms = Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/win32manifest:$manifest" "/win32icon:$icon" "/out:$exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll /r:System.Web.Extensions.dll "/r:$core" "/r:$forms" (Join-Path $root 'WebWidget.cs') (Join-Path $root 'Core.cs') (Join-Path $root 'Settings.cs') (Join-Path $root 'Display.cs') (Join-Path $root 'Scale.cs') (Join-Path $root 'EdgeLauncher.cs') (Join-Path $root 'Audio.cs')
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
Copy-Item -LiteralPath $core -Destination $out -Force
Copy-Item -LiteralPath $forms -Destination $out -Force
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $out -Force
Copy-Item -LiteralPath (Join-Path $root 'web') -Destination $out -Recurse -Force
Write-Output $exe
