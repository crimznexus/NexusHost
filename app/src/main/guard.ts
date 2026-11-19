// NexusGuard: the bundled plugin that locks each player name to the Tailscale account that first used it.
// The plugin re-reads plugins/NexusGuard/bindings.yml on every login, so this module edits that file directly.
import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { GuardInfo, GuardLock } from '@shared/types'
import { resourcePath, run } from './util'

const TS = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe')
const bindingsFile = (dir: string) => path.join(dir, 'plugins', 'NexusGuard', 'bindings.yml')
const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`

function parse(yml: string): GuardLock[] {
  const out: GuardLock[] = []
  let cur: Record<string, string> | null = null
  for (const line of yml.split(/\r?\n/)) {
    const top = /^([^\s#][^:]*):\s*$/.exec(line)
    if (top) { cur = { key: top[1] }; out.push(cur as any); continue }
    const kv = /^\s+([\w-]+):\s*(.*)$/.exec(line)
    if (kv && cur) cur[kv[1]] = kv[2].replace(/^'(.*)'$/, (_m, s) => s.replace(/''/g, "'")).replace(/^"(.*)"$/, '$1')
  }
  return out.map((c: any) => ({ name: c.name || c.key, tailscaleName: c['tailscale-name'] || '', tailscaleLogin: c['tailscale-login'] || '', userId: c['tailscale-user-id'] || '', device: c.device || '', lockedAt: c['locked-at'] || '' }))
}

function serialize(locks: GuardLock[]): string {
  return locks.map((l) => [
    `${l.name.toLowerCase()}:`, `  name: ${q(l.name)}`, `  tailscale-user-id: ${q(l.userId)}`, `  tailscale-login: ${q(l.tailscaleLogin)}`,
    `  tailscale-name: ${q(l.tailscaleName)}`, `  device: ${q(l.device)}`, `  locked-at: ${q(l.lockedAt)}`
  ].join('\n')).join('\n') + '\n'
}

export async function readLocks(dir: string): Promise<GuardLock[]> {
  const f = bindingsFile(dir)
  return existsSync(f) ? parse(await fsp.readFile(f, 'utf8')) : []
}

async function writeLocks(dir: string, locks: GuardLock[]) {
  await fsp.mkdir(path.dirname(bindingsFile(dir)), { recursive: true })
  await fsp.writeFile(bindingsFile(dir), serialize(locks), 'utf8')
}

export async function guardInfo(dir: string): Promise<GuardInfo> {
  const enabledJar = existsSync(path.join(dir, 'plugins', 'NexusGuard.jar'))
  return { supported: true, installed: enabledJar, locks: await readLocks(dir) }
}

export async function unlock(dir: string, name: string) {
  await writeLocks(dir, (await readLocks(dir)).filter((l) => l.name.toLowerCase() !== name.toLowerCase()))
}

async function whois(ip: string) {
  const r = await run(TS, ['whois', '--json', ip], { timeoutMs: 8000 })
  try {
    const j = JSON.parse(r.stdout)
    if (!j.UserProfile?.ID) return null
    return { userId: String(j.UserProfile.ID), login: j.UserProfile.LoginName ?? '', display: j.UserProfile.DisplayName ?? '', device: j.Node?.ComputedName ?? '' }
  } catch { return null }
}

/** Finds the last Tailscale address each name joined from, in the server logs (newest first). */
async function lastAddresses(dir: string): Promise<Map<string, string>> {
  const logs = path.join(dir, 'logs')
  const seen = new Map<string, string>()
  if (!existsSync(logs)) return seen
  const files = (await fsp.readdir(logs)).filter((f) => /\.log(\.gz)?$/.test(f))
  const stats = await Promise.all(files.map(async (f) => ({ f, t: (await fsp.stat(path.join(logs, f))).mtimeMs })))
  for (const { f } of stats.sort((a, b) => b.t - a.t)) {
    const buf = await fsp.readFile(path.join(logs, f))
    const txt = f.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8')
    const lines = txt.split(/\r?\n/).reverse()
    for (const l of lines) {
      const m = /\]: ([A-Za-z0-9_]{1,16})\[\/(\d+\.\d+\.\d+\.\d+):\d+\] logged in/.exec(l)
      if (m && !seen.has(m[1].toLowerCase())) seen.set(m[1].toLowerCase(), m[2])
    }
  }
  return seen
}

/**
 * Installs NexusGuard and locks every whitelisted name that has joined before to the Tailscale account it last
 * joined from, so nobody can claim an existing player's name first. Returns a report.
 */
export async function installGuard(dir: string, whitelist: { name: string }[]): Promise<string[]> {
  const report: string[] = []
  const pdir = path.join(dir, 'plugins')
  await fsp.mkdir(pdir, { recursive: true })
  await fsp.copyFile(resourcePath('plugins', 'NexusGuard.jar'), path.join(pdir, 'NexusGuard.jar'))
  await fsp.rm(path.join(dir, 'plugins-disabled', 'NexusGuard.jar'), { force: true })
  report.push('NexusGuard installed. It starts protecting names after the next server start.')
  if (!existsSync(TS)) { report.push('Tailscale is not installed here, so no names could be locked yet.'); return report }
  const locks = await readLocks(dir)
  const addrs = await lastAddresses(dir)
  for (const w of whitelist) {
    if (locks.some((l) => l.name.toLowerCase() === w.name.toLowerCase())) continue
    const ip = addrs.get(w.name.toLowerCase())
    if (!ip) { report.push(`${w.name}: hasn't joined yet; locks on their first join`); continue }
    const id = await whois(ip)
    if (!id) { report.push(`${w.name}: last joined from ${ip}, which Tailscale no longer knows; locks on next join`); continue }
    locks.push({ name: w.name, userId: id.userId, tailscaleLogin: id.login, tailscaleName: id.display, device: id.device, lockedAt: new Date().toISOString() })
    report.push(`${w.name}: locked to ${id.display || id.login}`)
  }
  await writeLocks(dir, locks)
  return report
}
