$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out=Join-Path $PSScriptRoot 'CoreTests.exe'
& $compiler /nologo /target:exe /platform:x64 /out:$out /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $root 'Display.cs') (Join-Path $root 'Scale.cs') (Join-Path $root 'Audio.cs') (Join-Path $root 'Core.cs') (Join-Path $root 'EdgeLauncher.cs') (Join-Path $root 'Settings.cs') (Join-Path $PSScriptRoot 'CoreTests.cs')
if($LASTEXITCODE -ne 0){throw 'Test compilation failed'}
& $out
if($LASTEXITCODE -ne 0){throw 'Tests failed'}
