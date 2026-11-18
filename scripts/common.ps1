# Shared helpers for the NexusHost scripts. Dot-source it: . "$PSScriptRoot\scripts\common.ps1"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:UA = 'NexusHost/2.0 (+https://github.com/crimznexus/NexusHost)'
$script:RepoRoot = Split-Path -Parent $PSScriptRoot

function Read-NexusConfig([string]$Path) {
  if (-not $Path) { $Path = Join-Path $RepoRoot 'nexus.config.json' }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Config not found: $Path`nCopy nexus.config.example.json to nexus.config.json and edit it first."
  }
  $cfg = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  $defaults = Get-Content -LiteralPath (Join-Path $RepoRoot 'nexus.config.example.json') -Raw | ConvertFrom-Json
  foreach ($p in $defaults.PSObject.Properties) {
    if (-not $cfg.PSObject.Properties[$p.Name]) { $cfg | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value }
  }
  $dir = $cfg.serverDir
  if (-not [IO.Path]::IsPathRooted($dir)) { $dir = Join-Path $RepoRoot $dir }
  $cfg | Add-Member -Force -NotePropertyName ServerPath -NotePropertyValue ([IO.Path]::GetFullPath($dir))
  $cfg
}

function Get-Json([string]$Url) {
  for ($i = 0; $i -lt 5; $i++) {
    $r = curl.exe -sS -A $UA $Url
    if ($LASTEXITCODE -eq 0 -and $r -and "$r" -notmatch '^\s*<') { return ($r | ConvertFrom-Json) }
    Start-Sleep -Seconds 2
  }
  throw "Request failed: $Url"
}

function Get-FileHashHex([string]$Path, [string]$Algorithm) {
  $alg = switch ($Algorithm) { 'sha256' { [Security.Cryptography.SHA256]::Create() } 'sha512' { [Security.Cryptography.SHA512]::Create() } default { throw "unsupported hash $Algorithm" } }
  $fs = [IO.File]::OpenRead($Path)
  try { -join ($alg.ComputeHash($fs) | ForEach-Object { $_.ToString('x2') }) } finally { $fs.Dispose(); $alg.Dispose() }
}

# Downloads $Url to $Dest unless a file with the expected hash is already there. Returns $true if it downloaded.
function Save-Verified([string]$Url, [string]$Dest, [string]$Hash, [string]$Algorithm) {
  if ((Test-Path -LiteralPath $Dest) -and (Get-FileHashHex $Dest $Algorithm) -eq $Hash) { return $false }
  $tmp = "$Dest.part"
  curl.exe -sSLf --retry 3 -A $UA -o $tmp $Url
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
  if ((Get-FileHashHex $tmp $Algorithm) -ne $Hash) { Remove-Item -LiteralPath $tmp -Force; throw "Checksum mismatch: $Url" }
  Move-Item -LiteralPath $tmp -Destination $Dest -Force
  $true
}

# Latest Modrinth version of a project for one game version and loader list. Prefers releases.
function Get-ModrinthVersion([string]$Project, [string]$GameVersion, [string[]]$Loaders) {
  $gv = [uri]::EscapeDataString((ConvertTo-Json @($GameVersion) -Compress))
  $ld = [uri]::EscapeDataString((ConvertTo-Json @($Loaders) -Compress))
  $vs = @(Get-Json "https://api.modrinth.com/v2/project/$Project/version?game_versions=$gv&loaders=$ld")
  if ($vs.Count -eq 0) { return $null }
  $rel = $vs | Where-Object version_type -eq 'release' | Select-Object -First 1
  if ($rel) { $rel } else { $vs[0] }
}

function Get-PrimaryFile($Version) {
  $f = $Version.files | Where-Object primary | Select-Object -First 1
  if (-not $f) { $f = $Version.files[0] }
  $f
}

function Get-JavaMajor([string]$Exe) {
  $out = (& $Exe -version 2>&1 | ForEach-Object { "$_" }) -join "`n"
  if ($out -match 'version "1\.(\d+)') { return [int]$Matches[1] }
  if ($out -match 'version "(\d+)') { return [int]$Matches[1] }
  0
}

# Finds the newest installed Java with at least $Minimum as its major version.
function Find-Java([int]$Minimum) {
  $cands = [Collections.Generic.List[string]]::new()
  if ($env:JAVA_HOME) { $cands.Add((Join-Path $env:JAVA_HOME 'bin\java.exe')) }
  foreach ($root in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Java", "$env:ProgramFiles\Zulu", "$env:ProgramFiles\Amazon Corretto")) {
    if (Test-Path -LiteralPath $root) { Get-ChildItem -LiteralPath $root -Directory | ForEach-Object { $cands.Add((Join-Path $_.FullName 'bin\java.exe')) } }
  }
  Get-Command java -All -ErrorAction SilentlyContinue | ForEach-Object { $cands.Add($_.Source) }
  $best = $null; $bestMajor = 0
  foreach ($c in ($cands | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $c)) { continue }
    $m = Get-JavaMajor $c
    if ($m -ge $Minimum -and $m -gt $bestMajor) { $best = $c; $bestMajor = $m }
  }
  $best
}

function Get-TailscaleIp {
  $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
  if (-not (Test-Path -LiteralPath $ts)) { return $null }
  $ip = (& $ts ip -4 2>$null | Select-Object -First 1)
  if ($ip -match '^100\.') { $ip.Trim() } else { $null }
}

function Get-Slug([string]$Name) { ($Name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-') }

function Write-Step([string]$Msg) { Write-Host $Msg -ForegroundColor Green }
function Write-Note([string]$Msg) { Write-Host $Msg -ForegroundColor DarkGray }
