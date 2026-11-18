import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import type { PlayerEntry, PlayerLists } from '@shared/types'
import { readProperties, writeProperties } from './properties'
import { mojangUuid, offlineUuid, readJson, stamp, writeJson } from './util'
import type { ServerManager } from './server'

export async function getPlayers(dir: string, online: string[]): Promise<PlayerLists> {
  const props = await readProperties(dir)
  const rd = (f: string) => readJson<any[]>(path.join(dir, f), [])
  return {
    online,
    whitelist: await rd('whitelist.json'),
    ops: await rd('ops.json'),
    banned: await rd('banned-players.json'),
    bannedIps: await rd('banned-ips.json'),
    known: await rd('usercache.json'),
    whitelistEnabled: props['white-list'] === 'true',
    onlineMode: props['online-mode'] !== 'false'
  }
}

async function profileFor(dir: string, name: string): Promise<PlayerEntry> {
  const props = await readProperties(dir)
  if (props['online-mode'] === 'false') return { uuid: offlineUuid(name), name }
  const p = await mojangUuid(name)
  if (!p) throw new Error(`"${name}" is not a Minecraft account. For TLauncher players turn on offline mode first.`)
  return p
}

/** Runs an action through the console when the server is running, otherwise edits the JSON files. */
export async function playerAction(dir: string, srv: ServerManager, action: string, name: string, reason = '') {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name) && action !== 'pardon-ip') throw new Error('Minecraft names are 1-16 letters, numbers or _.')
  if (srv.running) {
    const cmd: Record<string, string> = {
      'whitelist-add': `whitelist add ${name}`, 'whitelist-remove': `whitelist remove ${name}`, op: `op ${name}`, deop: `deop ${name}`,
      kick: `kick ${name} ${reason}`.trim(), ban: `ban ${name} ${reason}`.trim(), pardon: `pardon ${name}`, 'pardon-ip': `pardon-ip ${name}`
    }
    srv.sendCommand(cmd[action])
    return
  }
  if (action === 'kick') throw new Error('The server is not running.')
  const file = { 'whitelist-add': 'whitelist.json', 'whitelist-remove': 'whitelist.json', op: 'ops.json', deop: 'ops.json', ban: 'banned-players.json', pardon: 'banned-players.json', 'pardon-ip': 'banned-ips.json' }[action]!
  const f = path.join(dir, file)
  const list = await readJson<any[]>(f, [])
  const same = (e: any) => (e.name ?? '').toLowerCase() === name.toLowerCase()
  if (action === 'whitelist-remove' || action === 'deop' || action === 'pardon') { await writeJson(f, list.filter((e) => !same(e))); return }
  if (action === 'pardon-ip') { await writeJson(f, list.filter((e) => e.ip !== name)); return }
  if (list.some(same)) return
  const p = await profileFor(dir, name)
  if (action === 'op') list.push({ ...p, level: 4, bypassesPlayerLimit: false })
  else if (action === 'ban') list.push({ ...p, created: new Date().toISOString(), source: 'NexusHost', expires: 'forever', reason: reason || 'Banned by an operator.' })
  else list.push(p)
  await writeJson(f, list)
}

/**
 * Switches online <-> offline mode and moves each known player's saves (inventory, advancements, stats)
 * to the UUID the new mode will give them, so nobody loses progress. Server must be stopped.
 * renames maps a current name to the exact name the player will type (offline names are case-sensitive).
 * Returns a report, one line per change.
 */
export async function switchMode(dir: string, offline: boolean, renames: Record<string, string>): Promise<string[]> {
  const report: string[] = []
  const props = await readProperties(dir)
  const level = props['level-name'] || 'world'
  const players = new Map<string, string>() // current uuid -> name
  for (const f of ['whitelist.json', 'ops.json', 'usercache.json', 'banned-players.json']) {
    for (const e of await readJson<any[]>(path.join(dir, f), [])) if (e.uuid && e.name && !players.has(e.uuid)) players.set(e.uuid, renames[e.name] ?? e.name)
  }
  const target = new Map<string, string>() // old uuid -> new uuid
  for (const [uuid, name] of players) {
    let nu: string | null
    if (offline) nu = offlineUuid(name)
    else { const p = await mojangUuid(name); nu = p?.uuid ?? null; if (!p) report.push(`${name}: no Minecraft account with this name, kept as is (they cannot join in online mode)`) }
    if (nu && nu !== uuid) target.set(uuid, nu)
  }
  const dirs = existsSync(path.join(dir, level, 'players'))
    ? [['players/data', '.dat'], ['players/data', '.dat_old'], ['players/advancements', '.json'], ['players/stats', '.json']]
    : [['playerdata', '.dat'], ['playerdata', '.dat_old'], ['advancements', '.json'], ['stats', '.json']]
  const bk = path.join(dir, 'backups', `mode-switch-${stamp()}`)
  await fsp.mkdir(bk, { recursive: true })
  for (const f of ['whitelist.json', 'ops.json', 'usercache.json', 'banned-players.json', 'server.properties']) {
    if (existsSync(path.join(dir, f))) await fsp.copyFile(path.join(dir, f), path.join(bk, f))
  }
  for (const [sub, ext] of dirs) {
    const d = path.join(dir, level, sub)
    if (!existsSync(d)) continue
    await fsp.cp(d, path.join(bk, sub.replace('/', '_')), { recursive: true, force: false, errorOnExist: false })
    for (const [oldU, newU] of target) {
      const src = path.join(d, oldU + ext), dst = path.join(d, newU + ext)
      if (!existsSync(src)) continue
      if (existsSync(dst)) await fsp.rename(dst, path.join(bk, `replaced-${newU}${ext}`))
      await fsp.rename(src, dst)
      if (ext !== '.dat_old') report.push(`${players.get(oldU)}: ${sub.split('/').pop()} moved`)
    }
  }
  for (const f of ['whitelist.json', 'ops.json', 'banned-players.json']) {
    const list = await readJson<any[]>(path.join(dir, f), [])
    await writeJson(path.join(dir, f), list.map((e) => target.has(e.uuid) ? { ...e, uuid: target.get(e.uuid), name: players.get(e.uuid) } : e))
  }
  await writeJson(path.join(dir, 'usercache.json'), [])
  await writeProperties(dir, { 'online-mode': offline ? 'false' : 'true', 'enforce-secure-profile': offline ? 'false' : 'true' })
  report.push(`Switched to ${offline ? 'offline' : 'online'} mode. Backup: ${bk}`)
  return report
}

export async function setWhitelist(dir: string, srv: ServerManager, on: boolean) {
  await writeProperties(dir, { 'white-list': String(on), 'enforce-whitelist': String(on) })
  if (srv.running) srv.sendCommand(on ? 'whitelist on' : 'whitelist off')
}
