#requires -Version 7
# Switches an existing server to offline mode so TLauncher and other non-premium launchers can join,
# keeping everyone's inventory, position, advancements and stats.
#
# Offline mode gives each player a new ID made from their name, so this script moves each player's
# files from their Mojang ID to that new ID, and rewrites whitelist.json and ops.json to match.
# Names are case-sensitive in offline mode: "Steve" and "steve" are different players. If someone
# will log in with different capitals than their whitelist entry, map it with -Rename.
#
# Run it ONLY while the server is stopped. A backup goes to <server>\backups\offline-switch-<time>.
# Usage:  pwsh -File scripts\switch-to-offline.ps1 [-Rename Steve=steve,Alex=alex] [-WhatIf]
param([string]$Config, [string[]]$Rename = @(), [switch]$WhatIf)
. "$PSScriptRoot\common.ps1"
$cfg = Read-NexusConfig $Config
$srv = $cfg.ServerPath
Set-Location $srv

function OfflineUuid([string]$n) {
  $md5 = [Security.Cryptography.MD5]::Create(); $b = $md5.ComputeHash([Text.Encoding]::UTF8.GetBytes("OfflinePlayer:$n"))
  $b[6] = ($b[6] -band 0x0f) -bor 0x30; $b[8] = ($b[8] -band 0x3f) -bor 0x80
  $h = -join ($b | ForEach-Object { $_.ToString('x2') })
  '{0}-{1}-{2}-{3}-{4}' -f $h.Substring(0,8), $h.Substring(8,4), $h.Substring(12,4), $h.Substring(16,4), $h.Substring(20)
}
function Read-List([string]$f) { if (Test-Path -LiteralPath $f) { @(Get-Content -LiteralPath $f -Raw | ConvertFrom-Json) } else { @() } }

$listening = Get-NetTCPConnection -State Listen -LocalPort $cfg.ports.minecraft -ErrorAction SilentlyContinue
if ($listening) { throw "Something is listening on port $($cfg.ports.minecraft). Type 'stop' in the server window first." }
if (Select-String -LiteralPath 'server.properties' -Pattern '^online-mode=false' -Quiet) { Write-Warning 'server.properties already says online-mode=false. Continuing only moves any files still under Mojang IDs.' }

# Everyone the server knows: whitelist, ops, and recent players (usercache)
$white = Read-List 'whitelist.json'; $opsList = Read-List 'ops.json'; $cache = Read-List 'usercache.json'
$players = [ordered]@{}
foreach ($e in @($white) + @($opsList) + @($cache)) { if ($e.uuid -and $e.name -and -not $players.Contains($e.uuid)) { $players[$e.uuid] = $e.name } }
$map = @{}
foreach ($r in $Rename -split ',') { if ($r -notmatch '^\s*([A-Za-z0-9_]{1,16})=([A-Za-z0-9_]{1,16})\s*$') { throw "Bad -Rename entry '$r' (expected OldName=newname)" }; $map[$Matches[1]] = $Matches[2] }
foreach ($k in @($players.Keys)) { $n = $players[$k]; $hit = $map.Keys | Where-Object { $_ -ceq $n } | Select-Object -First 1; if ($hit) { $players[$k] = $map[$hit] } }
if ($players.Count -eq 0) { throw 'No players found in whitelist.json, ops.json or usercache.json.' }

$level = 'world'
$m = Select-String -LiteralPath 'server.properties' -Pattern '^level-name=(.+)$' | Select-Object -First 1
if ($m) { $level = $m.Matches[0].Groups[1].Value.Trim() }
# Minecraft 26.x keeps players in <world>\players\{data,advancements,stats}; older versions use <world>\{playerdata,advancements,stats}
$dirs = if (Test-Path -LiteralPath "$level\players") { @{ data = "$level\players\data"; adv = "$level\players\advancements"; stats = "$level\players\stats" } }
        else { @{ data = "$level\playerdata"; adv = "$level\advancements"; stats = "$level\stats" } }

$bk = Join-Path $srv ("backups\offline-switch-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (-not $WhatIf) {
  New-Item -ItemType Directory -Force $bk | Out-Null
  foreach ($d in $dirs.Values) { if (Test-Path -LiteralPath $d) { Copy-Item -Recurse -LiteralPath $d (Join-Path $bk ($d -replace '[\\/]', '_')) } }
  foreach ($f in 'whitelist.json', 'ops.json', 'usercache.json', 'server.properties') { if (Test-Path -LiteralPath $f) { Copy-Item -LiteralPath $f $bk } }
  Write-Step "Backup: $bk"
}

foreach ($online in $players.Keys) {
  $name = $players[$online]; $offline = OfflineUuid $name
  if ($online -eq $offline) { continue }
  foreach ($pair in @(@($dirs.data, '.dat'), @($dirs.data, '.dat_old'), @($dirs.adv, '.json'), @($dirs.stats, '.json'))) {
    $src = Join-Path $pair[0] "$online$($pair[1])"; $dst = Join-Path $pair[0] "$offline$($pair[1])"
    if (-not (Test-Path -LiteralPath $src)) { continue }
    if (-not $WhatIf) {
      if (Test-Path -LiteralPath $dst) { Move-Item -LiteralPath $dst -Destination (Join-Path $bk "replaced-$offline$($pair[1])") -Force }
      Move-Item -LiteralPath $src -Destination $dst
    }
    Write-Note ("  {0,-17} {1,-13} {2} -> {3}" -f $name, (Split-Path $pair[0] -Leaf), $online, $offline)
  }
}

$utf8 = New-Object Text.UTF8Encoding $false
$newWhite = @($white | ForEach-Object { $n = $players[$_.uuid]; if (-not $n) { $n = $_.name }; [ordered]@{ uuid = (OfflineUuid $n); name = $n } })
$newOps = @($opsList | ForEach-Object { $n = $players[$_.uuid]; if (-not $n) { $n = $_.name }; [ordered]@{ uuid = (OfflineUuid $n); name = $n; level = $_.level; bypassesPlayerLimit = $_.bypassesPlayerLimit } })
$p = @(Get-Content -LiteralPath 'server.properties') -replace '^online-mode=.*', 'online-mode=false' -replace '^enforce-secure-profile=.*', 'enforce-secure-profile=false'
if (-not ($p -match '^enforce-secure-profile=')) { $p += 'enforce-secure-profile=false' }
if (-not $WhatIf) {
  [IO.File]::WriteAllText((Join-Path $srv 'whitelist.json'), (ConvertTo-Json $newWhite -Depth 3), $utf8)
  [IO.File]::WriteAllText((Join-Path $srv 'ops.json'), (ConvertTo-Json $newOps -Depth 3), $utf8)
  [IO.File]::WriteAllText((Join-Path $srv 'usercache.json'), '[]', $utf8)
  [IO.File]::WriteAllLines((Join-Path $srv 'server.properties'), $p, $utf8)
}
Write-Step "Whitelist: $(($newWhite.name) -join ', ')"
Write-Step "Ops: $(($newOps.name) -join ', ')"
Write-Step 'server.properties: online-mode=false, enforce-secure-profile=false'
if (-not $cfg.allowCrackedLaunchers) { Write-Warning 'Also set "allowCrackedLaunchers": true in nexus.config.json and run setup-server.ps1 (installs SkinsRestorer so skins still show).' }
Write-Host "`nDone. Whitelisted players can now join from TLauncher with exactly the names listed above." -ForegroundColor Yellow
