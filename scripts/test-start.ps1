#requires -Version 7
# Starts the server headless with the Java and jar from server\start.bat, waits for "Done",
# sends optional console commands, then stops it cleanly. Handy after updating Paper or plugins.
# Don't run it while the real server is running.
param([string]$Config, [string[]]$Commands = @(), [int]$SettleSeconds = 5,
      [string]$Pattern = 'WARN|ERROR|Done \(|Enabling')
. "$PSScriptRoot\common.ps1"
$cfg = Read-NexusConfig $Config
$srv = $cfg.ServerPath
$bat = Get-Content -LiteralPath (Join-Path $srv 'start.bat') -Raw
$java = [regex]::Match($bat, 'set "JAVA=([^"]+)"').Groups[1].Value
$jar  = [regex]::Match($bat, 'set "JAR=([^"]+)"').Groups[1].Value
if (-not $java -or -not $jar) { throw 'Run setup-server.ps1 first.' }

$psi = [Diagnostics.ProcessStartInfo]::new($java, "-Xms2G -Xmx4G -jar `"$jar`" --nogui")
$psi.WorkingDirectory = $srv
$psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.UseShellExecute = $false
$proc = [Diagnostics.Process]::Start($psi)
$out = [Collections.Generic.List[string]]::new()
$sw = [Diagnostics.Stopwatch]::StartNew(); $done = $false
while (-not $proc.StandardOutput.EndOfStream -and $sw.Elapsed.TotalSeconds -lt 300) {
  $l = $proc.StandardOutput.ReadLine(); $out.Add($l)
  if ($l -match 'Done \(' -and -not $done) {
    $done = $true
    $t = [Diagnostics.Stopwatch]::StartNew()
    $task = $proc.StandardOutput.ReadLineAsync()
    while ($t.Elapsed.TotalSeconds -lt $SettleSeconds) { if ($task.Wait(200)) { $out.Add($task.Result); $task = $proc.StandardOutput.ReadLineAsync() } }
    foreach ($c in $Commands) { $proc.StandardInput.WriteLine($c) }
    $proc.StandardInput.WriteLine('stop')
    while (-not $task.Wait(200)) { if ($proc.HasExited) { break } }
    if ($task.IsCompleted -and $task.Result) { $out.Add($task.Result) }
  }
}
if (-not $proc.WaitForExit(90000)) { $proc.Kill() }
"exit: $($proc.ExitCode)  reachedDone: $done"
$out | Select-String $Pattern | Where-Object { $_ -notmatch 'Advanced terminal' } | ForEach-Object Line
