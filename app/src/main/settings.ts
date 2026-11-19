import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { AppSettings, SavedServer } from '@shared/types'

const DEFAULTS: AppSettings = {
  servers: [],
  activeServerId: null,
  serverDir: null,
  serverName: 'Friends Server',
  loader: 'paper',
  mcVersion: '',
  memoryGB: 4,
  javaPath: null,
  javaFlags: [],
  iconText: 'NEXUS',
  autoStartServer: false,
  startWithWindows: false,
  closeToTray: true,
  autoRestart: true,
  autoStopMinutes: 0,
  backups: { daily: true, keep: 7, lastRun: null }
}

const file = () => path.join(app.getPath('userData'), 'settings.json')
let cache: AppSettings | null = null
const sameDir = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

/**
 * The active server's settings live in the top-level fields (serverDir, serverName, ...) so the rest of the app
 * only ever deals with "the server". This copies them into the servers list, creating an entry when needed.
 */
function syncActive(s: AppSettings): AppSettings {
  if (!s.serverDir) return s
  const servers = [...s.servers]
  let i = servers.findIndex((x) => x.id === s.activeServerId)
  if (i < 0) i = servers.findIndex((x) => sameDir(x.dir, s.serverDir!))
  const profile: SavedServer = {
    id: i >= 0 ? servers[i].id : randomUUID(),
    name: s.serverName, dir: s.serverDir, loader: s.loader, mcVersion: s.mcVersion, memoryGB: s.memoryGB,
    javaPath: s.javaPath, javaFlags: s.javaFlags, iconText: s.iconText, backups: s.backups
  }
  if (i >= 0) servers[i] = profile; else servers.push(profile)
  return { ...s, servers, activeServerId: profile.id }
}

function write(next: AppSettings) {
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8')
  cache = next
}

export function getSettings(): AppSettings {
  if (cache) return cache
  let loaded: Partial<AppSettings> = {}
  try { if (existsSync(file())) loaded = JSON.parse(readFileSync(file(), 'utf8')) } catch { /* corrupt: use defaults */ }
  const merged = { ...DEFAULTS, ...loaded, backups: { ...DEFAULTS.backups, ...(loaded.backups ?? {}) }, servers: (loaded.servers ?? []).map((x) => ({ ...x, loader: x.loader ?? 'paper' })) }
  // settings from 2.0 had a single server and no list: move it into the list
  const synced = syncActive(merged)
  if (synced !== merged && !loaded.servers?.length) write(synced)
  cache = synced
  return cache
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  if (patch.backups) next.backups = { ...getSettings().backups, ...patch.backups }
  next.memoryGB = Math.max(1, Math.min(64, Math.round(next.memoryGB)))
  next.autoStopMinutes = Math.max(0, Math.round(next.autoStopMinutes))
  next.backups.keep = Math.max(1, Math.min(100, Math.round(next.backups.keep)))
  const synced = syncActive(next)
  write(synced)
  if (patch.startWithWindows !== undefined && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: synced.startWithWindows, args: ['--hidden'] })
  }
  return synced
}

/** Makes another saved server the active one. The caller makes sure no server is running. */
export function activateServer(id: string): AppSettings {
  const s = getSettings()
  const p = s.servers.find((x) => x.id === id)
  if (!p) throw new Error('That server is not in the list any more.')
  return saveSettings({
    activeServerId: p.id, serverDir: p.dir, serverName: p.name, loader: p.loader, mcVersion: p.mcVersion, memoryGB: p.memoryGB,
    javaPath: p.javaPath, javaFlags: p.javaFlags, iconText: p.iconText, backups: p.backups
  })
}

/** Takes a server off the list (its files stay on disk). Removing the active one switches to another or to setup. */
export function forgetServer(id: string): AppSettings {
  const s = getSettings()
  const rest = s.servers.filter((x) => x.id !== id)
  if (s.activeServerId !== id) { write({ ...s, servers: rest }); return cache! }
  write({ ...s, servers: rest, activeServerId: null, serverDir: null })
  return rest.length ? activateServer(rest[0].id) : cache!
}

export function renameSaved(id: string, name: string): AppSettings {
  const s = getSettings()
  if (s.activeServerId === id) return saveSettings({ serverName: name })
  write({ ...s, servers: s.servers.map((x) => (x.id === id ? { ...x, name } : x)) })
  return cache!
}

export function requireServerDir(): string {
  const d = getSettings().serverDir
  if (!d) throw new Error('No server set up yet.')
  return d
}
