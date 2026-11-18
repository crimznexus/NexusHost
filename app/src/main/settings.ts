import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  serverDir: null,
  serverName: 'Friends Server',
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

export function getSettings(): AppSettings {
  if (cache) return cache
  let loaded: Partial<AppSettings> = {}
  try { if (existsSync(file())) loaded = JSON.parse(readFileSync(file(), 'utf8')) } catch { /* corrupt: use defaults */ }
  cache = { ...DEFAULTS, ...loaded, backups: { ...DEFAULTS.backups, ...(loaded.backups ?? {}) } }
  return cache
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  if (patch.backups) next.backups = { ...getSettings().backups, ...patch.backups }
  next.memoryGB = Math.max(1, Math.min(64, Math.round(next.memoryGB)))
  next.autoStopMinutes = Math.max(0, Math.round(next.autoStopMinutes))
  next.backups.keep = Math.max(1, Math.min(100, Math.round(next.backups.keep)))
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8')
  cache = next
  if (patch.startWithWindows !== undefined && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: next.startWithWindows, args: ['--hidden'] })
  }
  return next
}

export function requireServerDir(): string {
  const d = getSettings().serverDir
  if (!d) throw new Error('No server set up yet.')
  return d
}
