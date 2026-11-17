# Checks that every mod's required dependency (fabric.mod.json "depends") is provided by another mod in the folder.
param([Parameter(Mandatory)][string]$ModsDir)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$provided = @{ minecraft = $true; java = $true; fabricloader = $true; 'fabric-loader' = $true }
$mods = @()
function Read-ModJson([IO.Compression.ZipArchive]$zip, [string]$origin, [int]$depth) {
  $e = $zip.GetEntry('fabric.mod.json'); if (-not $e) { return }
  $sr = New-Object IO.StreamReader($e.Open()); $txt = $sr.ReadToEnd(); $sr.Close()
  $j = $txt | ConvertFrom-Json -ErrorAction SilentlyContinue
  if (-not $j) { return }
  $provided[$j.id] = $true
  foreach ($p in @($j.provides)) { if ($p) { $provided[$p] = $true } }
  if ($depth -eq 0) { $script:mods += [pscustomobject]@{ file = $origin; id = $j.id; depends = $j.depends } }
  foreach ($nj in @($j.jars)) {
    if (-not $nj) { continue }
    $ne = $zip.GetEntry($nj.file); if (-not $ne) { continue }
    $ms = New-Object IO.MemoryStream; $s = $ne.Open(); $s.CopyTo($ms); $s.Close(); $ms.Position = 0
    $nz = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Read)
    Read-ModJson $nz $origin ($depth + 1); $nz.Dispose()
  }
}
foreach ($f in Get-ChildItem $ModsDir -Filter *.jar) {
  $z = [IO.Compression.ZipFile]::OpenRead($f.FullName); Read-ModJson $z $f.Name 0; $z.Dispose()
}
$problems = 0
foreach ($m in $mods) {
  if (-not $m.depends) { continue }
  foreach ($d in $m.depends.PSObject.Properties) {
    if (-not $provided.ContainsKey($d.Name)) { "MISSING: $($m.id) ($($m.file)) needs '$($d.Name)' $($d.Value)"; $problems++ }
  }
  $mcReq = $m.depends.minecraft; if ($mcReq) { "{0,-28} minecraft {1}" -f $m.id, ($mcReq -join ' ') }
}
"--- $($mods.Count) mods checked, $problems missing dependencies"
