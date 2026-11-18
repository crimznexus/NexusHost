#requires -Version 7
# Resolves mods\client-mods.txt into a lock file with exact Modrinth versions, URLs and hashes,
# following required dependencies. Usually called through build-installer.ps1 -Resolve.
param([Parameter(Mandatory)][string]$McVersion, [string]$ListFile, [string]$OutFile)
. "$PSScriptRoot\common.ps1"
if (-not $ListFile) { $ListFile = Join-Path $RepoRoot 'mods\client-mods.txt' }
if (-not $OutFile)  { $OutFile  = Join-Path $RepoRoot 'mods\client-mods.lock.json' }

$wanted = Get-Content -LiteralPath $ListFile | ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ } | ForEach-Object {
  $p = $_ -split '\s+'
  if ($p.Count -ne 2 -or $p[1] -notin 'mod', 'shader', 'resourcepack') { throw "Bad line in ${ListFile}: '$_' (expected: <slug> <mod|shader|resourcepack>)" }
  @{ ref = $p[0]; kind = $p[1] }
}
$loaderFor = @{ mod = @('fabric'); shader = @('iris'); resourcepack = @('minecraft') }
$result = [ordered]@{}; $seen = @{}; $missing = 0
$queue = [Collections.Generic.Queue[hashtable]]::new()
foreach ($w in $wanted) { $queue.Enqueue(@{ ref = $w.ref; kind = $w.kind; via = 'requested' }) }
while ($queue.Count) {
  $q = $queue.Dequeue()
  $v = Get-ModrinthVersion $q.ref $McVersion $loaderFor[$q.kind]
  if (-not $v) { Write-Warning "No $McVersion version: $($q.ref) ($($q.kind)), needed by $($q.via)"; $missing++; continue }
  if ($seen.ContainsKey($v.project_id)) { continue }
  $seen[$v.project_id] = $true
  $proj = Get-Json "https://api.modrinth.com/v2/project/$($v.project_id)"
  $f = Get-PrimaryFile $v
  $result[$proj.slug] = [ordered]@{ slug = $proj.slug; title = $proj.title; kind = $q.kind; version = $v.version_number; type = $v.version_type
    file = $f.filename; url = $f.url; sha512 = $f.hashes.sha512; size = $f.size; via = $q.via }
  foreach ($d in $v.dependencies | Where-Object dependency_type -eq 'required') {
    if ($d.project_id -and -not $seen.ContainsKey($d.project_id)) { $queue.Enqueue(@{ ref = $d.project_id; kind = 'mod'; via = $proj.slug }) }
  }
}
$result.Values | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $OutFile -Encoding utf8
$result.Values | ForEach-Object { "  {0,-13} {1,-32} {2,-28} {3}" -f $_.kind, $_.slug, $_.version, $(if ($_.via -ne 'requested') { "(needed by $($_.via))" } else { '' }) }
"Resolved $($result.Count) files for Minecraft $McVersion -> $OutFile"
if ($missing) { Write-Warning "$missing entries have no version for $McVersion and were left out." }
