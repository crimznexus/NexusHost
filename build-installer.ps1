#requires -Version 7
# Builds the one-click mod installer friends run on their PCs, plus a filled-in join guide:
#   dist\Install-<ServerName>-Mods.bat
#   dist\FRIENDS-GUIDE.md
# -Resolve re-reads mods\client-mods.txt and picks the newest compatible versions first.
param([string]$Config, [switch]$Resolve)
. "$PSScriptRoot\scripts\common.ps1"
$cfg = Read-NexusConfig $Config
$lock = Join-Path $RepoRoot 'mods\client-mods.lock.json'
if ($Resolve -or -not (Test-Path -LiteralPath $lock)) { & (Join-Path $RepoRoot 'scripts\resolve-client-mods.ps1') -McVersion $cfg.mcVersion }

$ip = $cfg.tailscaleHost
if (-not $ip) { $ip = Get-TailscaleIp }
if (-not $ip) { throw 'Set "tailscaleHost" in nexus.config.json (your Tailscale IP, from: tailscale ip -4), or sign in to Tailscale on this PC.' }
if ($ip -notmatch '^[A-Za-z0-9.\-:]+$') { throw "tailscaleHost looks wrong: $ip" }
$name = $cfg.serverName
if ($name -match "[^\x20-\x7E]|['|`"%]") { throw 'serverName must be plain ASCII without quotes, | or %.' }
$key = Get-Slug $name

# Fabric loader: newest stable for this Minecraft version
$loaders = @(Get-Json "https://meta.fabricmc.net/v2/versions/loader/$($cfg.mcVersion)")
$loader = ($loaders | Where-Object { $_.loader.stable } | Select-Object -First 1).loader.version
if (-not $loader) { throw "No stable Fabric loader for Minecraft $($cfg.mcVersion) yet." }
$profileJson = (curl.exe -sS -A $UA "https://meta.fabricmc.net/v2/versions/loader/$($cfg.mcVersion)/$loader/profile/json") -join "`n"
if (($profileJson | ConvertFrom-Json).id -ne "fabric-loader-$loader-$($cfg.mcVersion)") { throw 'Unexpected Fabric profile response.' }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profileJson))

# Manifest: mods, then shaders (first in mods\client-mods.txt is the default), then resource packs
$order = @{ mod = 0; shader = 1; resourcepack = 2 }
$listed = @(Get-Content -LiteralPath (Join-Path $RepoRoot 'mods\client-mods.txt') | ForEach-Object { (($_ -replace '#.*$', '').Trim() -split '\s+')[0] } | Where-Object { $_ })
$mods = @(Get-Content -LiteralPath $lock -Raw | ConvertFrom-Json)
$mods = $mods | Sort-Object { $order[$_.kind] }, { $i = [array]::IndexOf($listed, $_.slug); if ($i -lt 0) { 999 } else { $i } }, title
$manifest = ($mods | ForEach-Object {
  $t = ($_.title -replace '[^\x20-\x7E]', '').Trim()
  foreach ($v in $t, $_.file, $_.url) { if ($v -match '[|\r\n]' -or $v -match "'@") { throw "Unsafe value in lock file: $v" } }
  if ($_.url -notmatch '^https://cdn\.modrinth\.com/') { throw "Unexpected download host: $($_.url)" }
  if ($_.sha512 -notmatch '^[0-9a-f]{128}$') { throw "Bad hash for $($_.slug)" }
  '{0}|{1}|{2}|{3}|{4}' -f $_.kind, $t, $_.file, $_.url, $_.sha512
}) -join "`r`n"

$ps = (Get-Content -LiteralPath (Join-Path $RepoRoot 'scripts\installer-template.ps1') -Raw).
  Replace('__SERVER_NAME__', $name).Replace('__SERVER_IP__', $ip).Replace('__PROFILE_KEY__', $key).
  Replace('__MC_VERSION__', $cfg.mcVersion).Replace('__LOADER__', $loader).Replace('__DATA_VERSION__', "$($cfg.dataVersion)").
  Replace('__FABRIC_PROFILE_B64__', $b64).Replace('__MANIFEST__', $manifest)
if ($ps -match '[^\x00-\x7F]') { throw 'Installer must be plain ASCII for cmd.exe.' }
$header = @"
<# : batch part - runs the PowerShell below. Keep this file as plain ASCII.
@echo off
title $name - mod installer
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$f='%~f0'; Invoke-Expression ([IO.File]::ReadAllText(`$f))"
echo.
pause
exit /b
#>
"@
$dist = Join-Path $RepoRoot 'dist'; New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist ("Install-{0}-Mods.bat" -f ($name -replace '[^A-Za-z0-9]', ''))
[IO.File]::WriteAllText($out, (($header + "`r`n" + $ps) -replace "(?<!`r)`n", "`r`n"), [Text.Encoding]::ASCII)

$guide = (Get-Content -LiteralPath (Join-Path $RepoRoot 'templates\FRIENDS-GUIDE.md') -Raw).
  Replace('{{SERVER_NAME}}', $name).Replace('{{SERVER_IP}}', $ip).Replace('{{MC_VERSION}}', $cfg.mcVersion).
  Replace('{{MOD_COUNT}}', "$($mods.Count)").Replace('{{INSTALLER}}', (Split-Path $out -Leaf)).
  Replace('{{BLUEMAP_PORT}}', "$($cfg.ports.bluemap)")
Set-Content -LiteralPath (Join-Path $dist 'FRIENDS-GUIDE.md') -Value $guide -Encoding utf8

"Built $out  (Fabric loader $loader, $($mods.Count) files, server $ip)"
"Built $(Join-Path $dist 'FRIENDS-GUIDE.md')"
'Send both files to your friends. dist\ is ignored by git because it contains your Tailscale IP.'
