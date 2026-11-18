import { existsSync, promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TailscaleInfo } from '@shared/types'
import { readProperties } from './properties'
import { resourcePath, run } from './util'

const TS = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe')

export async function firewallReady(): Promise<boolean> {
  const r = await run('powershell.exe', ['-NoProfile', '-Command',
    "@(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.DisplayName -match '^(NexusHost )?Minecraft \\(Tailscale only\\)$' }).Count"], { timeoutMs: 20000 })
  return Number(r.stdout.trim()) > 0
}

export async function tailscaleInfo(): Promise<TailscaleInfo> {
  const info: TailscaleInfo = { installed: existsSync(TS), running: false, loggedIn: false, ip: null, dnsName: null, hostName: null, firewallReady: await firewallReady() }
  if (!info.installed) return info
  const r = await run(TS, ['status', '--json'], { timeoutMs: 10000 })
  try {
    const j = JSON.parse(r.stdout)
    info.running = j.BackendState !== 'Stopped' && j.BackendState !== 'NoState'
    info.loggedIn = j.BackendState === 'Running'
    info.ip = j.Self?.TailscaleIPs?.find((x: string) => x.includes('.')) ?? null
    info.dnsName = (j.Self?.DNSName ?? '').replace(/\.$/, '') || null
    info.hostName = j.Self?.HostName ?? null
  } catch { /* tailscale not running */ }
  return info
}

/** Runs firewall.ps1 elevated (UAC prompt). Ports come from server.properties and plugin defaults. */
export async function setupFirewall(serverDir: string): Promise<boolean> {
  const props = await readProperties(serverDir)
  const cfg = path.join(os.tmpdir(), `nexushost-ports-${Date.now()}.json`)
  await fsp.writeFile(cfg, JSON.stringify({ ports: { minecraft: Number(props['server-port'] || 25565), bluemap: 8100, voicechat: 24454 } }))
  const script = resourcePath('firewall.ps1')
  const inner = `-NoProfile -ExecutionPolicy Bypass -File "${script}" -Config "${cfg}"`
  const r = await run('powershell.exe', ['-NoProfile', '-Command',
    `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '${inner.replace(/'/g, "''")}'; exit $p.ExitCode } catch { exit 1223 }`], { timeoutMs: 120000 })
  await fsp.rm(cfg, { force: true })
  return r.code === 0 && (await firewallReady())
}
