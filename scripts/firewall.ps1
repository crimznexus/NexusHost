# Run once from an ADMIN PowerShell:  pwsh -File scripts\firewall.ps1
# Safe to run again. Opens the server ports ONLY to Tailscale addresses (100.64.0.0/10):
#   TCP <minecraft>  Minecraft          (default 25565)
#   TCP <bluemap>    BlueMap web map    (default 8100)
#   UDP <voicechat>  Simple Voice Chat  (default 24454)
# It also disables the broad "Query User" rules Windows creates for java.exe when you click
# "Allow" on its first-run prompt. Those rules expose Java on every port to whatever Wi-Fi
# the PC is on.
#requires -RunAsAdministrator
param([string]$Config)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Config) { $Config = Join-Path $root 'nexus.config.json' }
if (-not (Test-Path -LiteralPath $Config)) { $Config = Join-Path $root 'nexus.config.example.json' }
$ports = (Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json).ports

$rules = @(
  @{ Name = 'NexusHost Minecraft (Tailscale only)'; Protocol = 'TCP'; Port = $ports.minecraft },
  @{ Name = 'NexusHost BlueMap (Tailscale only)';   Protocol = 'TCP'; Port = $ports.bluemap },
  @{ Name = 'NexusHost Voice Chat (Tailscale only)'; Protocol = 'UDP'; Port = $ports.voicechat }
)
foreach ($r in $rules) {
  if (-not $r.Port) { continue }
  Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol $r.Protocol `
    -LocalPort $r.Port -RemoteAddress 100.64.0.0/10 -Profile Any | Out-Null
  "Allowed $($r.Protocol) $($r.Port) from Tailscale: $($r.Name)"
}

Get-NetFirewallApplicationFilter | Where-Object Program -like '*\bin\java.exe' |
  Get-NetFirewallRule | Where-Object { $_.Name -like '*Query User*' -and $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' } | ForEach-Object {
    $_ | Disable-NetFirewallRule
    "Disabled broad rule: $($_.DisplayName) ($($_.Profile))"
  }
