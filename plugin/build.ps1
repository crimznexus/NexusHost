#requires -Version 7
# Builds NexusGuard.jar against a Paper server's own libraries (run the server once so libraries/ exists).
# Usage: pwsh -File plugin\build.ps1 -ServerDir C:\path\to\server [-Jdk "C:\Program Files\Eclipse Adoptium\jdk-25..."]
param([Parameter(Mandatory)][string]$ServerDir, [string]$Jdk, [string]$Out = "$PSScriptRoot\..\app\resources\plugins\NexusGuard.jar")
$ErrorActionPreference = 'Stop'
if (-not $Jdk) { $Jdk = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Directory | Where-Object Name -like 'jdk-*' | Sort-Object Name -Descending | Select-Object -First 1).FullName }
$javac = Join-Path $Jdk 'bin\javac.exe'; $jar = Join-Path $Jdk 'bin\jar.exe'
$cp = (Get-ChildItem (Join-Path $ServerDir 'libraries') -Recurse -Filter *.jar | ForEach-Object FullName) -join ';'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "nexusguard-build-$PID"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $tmp | Out-Null
$src = Get-ChildItem "$PSScriptRoot\src" -Recurse -Filter *.java | ForEach-Object FullName
# javac gets its arguments from a file: the classpath is too long for a command line
$argFile = Join-Path $tmp '..\nexusguard-javac-args.txt'
$q = { param($s) '"' + ($s -replace '\\', '/') + '"' }
[IO.File]::WriteAllLines($argFile, @('--release', '21', '-encoding', 'UTF-8', '-cp', (& $q $cp), '-d', (& $q $tmp)) + ($src | ForEach-Object { & $q $_ }))
& $javac "@$argFile"
Remove-Item $argFile -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
Copy-Item "$PSScriptRoot\resources\*" $tmp
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
Remove-Item $Out -ErrorAction SilentlyContinue
& $jar --create --file $Out -C $tmp .
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }
Remove-Item $tmp -Recurse -Force
"Built $([IO.Path]::GetFullPath($Out))"
