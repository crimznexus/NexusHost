#requires -Version 7
# NexusHost host setup. Safe to run again: it only downloads what changed.
#   1. Finds Java (the version Paper needs)
#   2. Downloads the latest stable Paper build for your Minecraft version
#   3. Downloads the server plugins and datapacks from Modrinth
#   4. Writes server.properties (first run only), start.bat and the server icon
# Usage:  pwsh -File setup-server.ps1 [-Config nexus.config.json] [-AcceptEula]
param([string]$Config, [switch]$AcceptEula)
. "$PSScriptRoot\scripts\common.ps1"
$cfg = Read-NexusConfig $Config
$srv = $cfg.ServerPath
New-Item -ItemType Directory -Force -Path $srv, (Join-Path $srv 'plugins') | Out-Null
Write-Host "`n=== NexusHost setup: $($cfg.serverName) (Minecraft $($cfg.mcVersion)) ===`n" -ForegroundColor Cyan
Write-Note "Server folder: $srv"

# 1. Paper metadata and Java
$paper = Get-Json "https://fill.papermc.io/v3/projects/paper/versions/$($cfg.mcVersion)"
$javaMin = [int]$paper.version.java.version.minimum
$java = Find-Java $javaMin
if (-not $java) {
  throw "Java $javaMin or newer was not found. Install it with:`n  winget install EclipseAdoptium.Temurin.$javaMin.JDK`nthen run this script again."
}
Write-Step "[1/5] Java $(Get-JavaMajor $java): $java"

# 2. Paper
$builds = @(Get-Json "https://fill.papermc.io/v3/projects/paper/versions/$($cfg.mcVersion)/builds")
$build = $builds | Where-Object channel -eq 'STABLE' | Select-Object -First 1
if (-not $build) { $build = $builds[0]; Write-Warning "No stable Paper build for $($cfg.mcVersion) yet; using experimental build $($build.id)." }
$dl = $build.downloads.'server:default'
$jar = Join-Path $srv $dl.name
$new = Save-Verified $dl.url $jar $dl.checksums.sha256 'sha256'
$oldJars = @(Get-ChildItem -LiteralPath $srv -Filter 'paper-*.jar' | Where-Object Name -ne $dl.name)
if ($oldJars.Count) {
  $oldDir = Join-Path $srv 'old-jars'; New-Item -ItemType Directory -Force $oldDir | Out-Null
  $oldJars | Move-Item -Destination $oldDir -Force
}
Write-Step ("[2/5] Paper build $($build.id) " + $(if ($new) { 'downloaded' } else { 'already up to date' }))

# 3. Plugins (tracked in plugins/.nexushost.json so updates replace the old jar and leave your own plugins alone)
$pluginsDir = Join-Path $srv 'plugins'
$trackFile = Join-Path $pluginsDir '.nexushost.json'
$previous = @(); if (Test-Path -LiteralPath $trackFile) { $previous = @(Get-Content -LiteralPath $trackFile -Raw | ConvertFrom-Json) }
$managed = [Collections.Generic.List[string]]::new()
Write-Step '[3/5] Plugins'
# allowCrackedLaunchers: offline mode; SkinsRestorer brings back skins, which offline mode loses
$cracked = [bool]$cfg.allowCrackedLaunchers
$pluginList = @($cfg.plugins)
if ($cracked) {
  $pluginList += @('skinsrestorer') | Where-Object { $pluginList -notcontains $_ }
  # NexusGuard locks each name to the Tailscale account that first joins with it
  Copy-Item (Join-Path $RepoRoot 'app\resources\plugins\NexusGuard.jar') (Join-Path $srv 'plugins\NexusGuard.jar') -Force
}
foreach ($slug in $pluginList) {
  $v = Get-ModrinthVersion $slug $cfg.mcVersion @('paper')
  if (-not $v) { $v = Get-ModrinthVersion $slug $cfg.mcVersion @('bukkit', 'spigot') }
  if (-not $v) { Write-Warning "      $slug has no version for Minecraft $($cfg.mcVersion) yet - skipped"; continue }
  $f = Get-PrimaryFile $v
  $got = Save-Verified $f.url (Join-Path $pluginsDir $f.filename) $f.hashes.sha512 'sha512'
  $managed.Add($f.filename)
  Write-Note ("      {0,-20} {1,-22} {2}" -f $slug, $v.version_number, $(if ($got) { 'downloaded' } else { 'up to date' }))
}
foreach ($old in $previous | Where-Object { $managed -notcontains $_ }) {
  $p = Join-Path $pluginsDir $old
  if (Test-Path -LiteralPath $p) {
    $oldDir = Join-Path $srv 'plugins-old'; New-Item -ItemType Directory -Force $oldDir | Out-Null
    Move-Item -LiteralPath $p -Destination $oldDir -Force; Write-Note "      moved old plugin to plugins-old: $old"
  }
}
ConvertTo-Json @($managed) | Set-Content -LiteralPath $trackFile -Encoding utf8

# Datapacks go into <world>/datapacks
$props = Join-Path $srv 'server.properties'
$level = 'world'
if (Test-Path -LiteralPath $props) { $m = Select-String -LiteralPath $props -Pattern '^level-name=(.+)$' | Select-Object -First 1; if ($m) { $level = $m.Matches[0].Groups[1].Value.Trim() } }
if (@($cfg.datapacks).Count) {
  $dpDir = Join-Path $srv "$level\datapacks"; New-Item -ItemType Directory -Force $dpDir | Out-Null
  foreach ($slug in $cfg.datapacks) {
    $v = Get-ModrinthVersion $slug $cfg.mcVersion @('datapack')
    if (-not $v) { Write-Warning "      datapack $slug has no version for $($cfg.mcVersion) - skipped"; continue }
    $f = Get-PrimaryFile $v
    $got = Save-Verified $f.url (Join-Path $dpDir $f.filename) $f.hashes.sha512 'sha512'
    Write-Note ("      {0,-20} {1,-22} {2}" -f $slug, $v.version_number, $(if ($got) { 'downloaded' } else { 'up to date' }))
  }
}

# 4. EULA, server.properties, start.bat
$eula = Join-Path $srv 'eula.txt'
$eulaOk = (Test-Path -LiteralPath $eula) -and (Select-String -LiteralPath $eula -Pattern '^eula=true' -Quiet)
if (-not $eulaOk) {
  if (-not $AcceptEula) {
    Write-Host "`nThe Minecraft server needs you to accept the Minecraft EULA: https://aka.ms/MinecraftEULA" -ForegroundColor Yellow
    $a = Read-Host 'Do you accept it? (yes/no)'
    $AcceptEula = $a -match '^(y|yes)$'
  }
  if ($AcceptEula) { Set-Content -LiteralPath $eula -Value "# Accepted by the server owner via NexusHost setup`neula=true" -Encoding ascii }
  else { Write-Warning 'EULA not accepted. The server will not start until eula=true is set in eula.txt.' }
}
if (-not (Test-Path -LiteralPath $props)) {
  @(
    "motd=$($cfg.motd)", "max-players=$($cfg.maxPlayers)", "server-port=$($cfg.ports.minecraft)",
    "online-mode=$(if ($cracked) { 'false' } else { 'true' })", "enforce-secure-profile=$(if ($cracked) { 'false' } else { 'true' })",
    'white-list=true', 'enforce-whitelist=true',
    "view-distance=$($cfg.viewDistance)", "simulation-distance=$($cfg.simulationDistance)", "difficulty=$($cfg.difficulty)"
  ) | Set-Content -LiteralPath $props -Encoding utf8
  Write-Note '      server.properties created (whitelist on). Edit it freely; setup will not overwrite it.'
}
$isOnline = -not (Select-String -LiteralPath $props -Pattern '^online-mode=false' -Quiet)
if ($cracked -and $isOnline) {
  Write-Warning "allowCrackedLaunchers is on, but this server still runs in online mode. Stop the server, then run:`n  pwsh -File scripts\switch-to-offline.ps1`nIt switches modes and moves everyone's saves to their new player IDs."
} elseif (-not $cracked -and -not $isOnline) {
  Write-Warning 'This server runs in offline mode but allowCrackedLaunchers is off. The login plugins stay installed only if you list them in "plugins".'
}
$flags = (@($paper.version.java.flags.recommended) -join ' ')
$bat = (Get-Content -LiteralPath (Join-Path $RepoRoot 'templates\start.bat') -Raw).
  Replace('__TITLE__', "$($cfg.serverName) (Paper $($cfg.mcVersion))").Replace('__JAVA__', $java).
  Replace('__JAR__', $dl.name).Replace('__MEM__', "$($cfg.memoryGB)G").Replace('__FLAGS__', $flags)
[IO.File]::WriteAllText((Join-Path $srv 'start.bat'), ($bat -replace "(?<!`r)`n", "`r`n"), [Text.Encoding]::ASCII)
Write-Step "[4/5] start.bat ready ($($cfg.memoryGB) GB RAM)"

# 5. Server icon
$icon = Join-Path $srv 'server-icon.png'
if (-not (Test-Path -LiteralPath $icon)) { & (Join-Path $RepoRoot 'scripts\make-icon.ps1') -Text $cfg.iconText -Out $icon -Preview (Join-Path $srv 'server-icon-preview.png') | Out-Null }
Write-Step '[5/5] Server icon ready (replace server-icon.png with any 64x64 PNG if you like)'

# Reminders
$tsIp = Get-TailscaleIp
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  - Open the firewall to Tailscale only (admin PowerShell, once):  pwsh -File `"$RepoRoot\scripts\firewall.ps1`""
Write-Host "  - Start the server:  $srv\start.bat"
Write-Host '  - In the server console:  whitelist add <name>   and   op <your name>'
$bm = Join-Path $pluginsDir 'BlueMap\core.conf'
if ((Test-Path -LiteralPath $bm) -and (Select-String -LiteralPath $bm -Pattern 'accept-download:\s*false' -Quiet)) {
  Write-Host "  - BlueMap: set accept-download: true in $bm, then restart (it downloads Mojang's client assets)."
}
if ($tsIp) { Write-Host "  - Friends connect to $tsIp (your Tailscale IP)." } else { Write-Host '  - Tailscale is not installed or not signed in: https://tailscale.com/download' -ForegroundColor Yellow }
Write-Host '  - Build the one-click mod installer for friends:  pwsh -File build-installer.ps1'
