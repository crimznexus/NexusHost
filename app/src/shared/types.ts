// Types shared by the main process, preload and renderer.

export type ServerState = 'stopped' | 'starting' | 'online' | 'stopping' | 'crashed' | 'external'

export interface AppSettings {
  serverDir: string | null
  serverName: string
  mcVersion: string
  memoryGB: number
  javaPath: string | null
  javaFlags: string[]
  iconText: string
  autoStartServer: boolean
  startWithWindows: boolean
  closeToTray: boolean
  autoRestart: boolean
  autoStopMinutes: number
  backups: { daily: boolean; keep: number; lastRun: string | null }
}

export interface LogLine {
  id: number
  time: number
  text: string
  level: 'info' | 'warn' | 'error' | 'command' | 'system'
}

export interface ServerStats {
  state: ServerState
  pid: number | null
  startedAt: number | null
  cpu: number | null
  memoryMB: number | null
  /** Java heap in use and the allocated maximum (-Xmx), from jcmd; null if jcmd is unavailable. */
  heapUsedMB: number | null
  heapMaxMB: number | null
  tps: number | null
  players: string[]
  maxPlayers: number
  lastExitCode: number | null
  emptySince: number | null
}

export interface JavaInfo { path: string; major: number }

export interface ServerInfo {
  dir: string
  exists: boolean
  jar: string | null
  paperBuild: number | null
  mcVersion: string | null
  eulaAccepted: boolean
  onlineMode: boolean
  levelName: string
  port: number
  hasWorld: boolean
}

export interface PlayerEntry { uuid: string; name: string; level?: number; reason?: string; created?: string }
export interface PlayerLists {
  online: string[]
  whitelist: PlayerEntry[]
  ops: PlayerEntry[]
  banned: PlayerEntry[]
  bannedIps: { ip: string; reason?: string }[]
  known: PlayerEntry[]
  whitelistEnabled: boolean
  onlineMode: boolean
}

export interface PluginInfo {
  file: string
  enabled: boolean
  name: string
  version: string
  description: string
  authors: string[]
  slug: string | null
  latestVersion: string | null
  updateFile: string | null
}

export interface ModrinthHit {
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  icon_url: string | null
  categories: string[]
}

export interface BackupInfo { file: string; name: string; size: number; created: number; auto: boolean }
export interface FileEntry { name: string; rel: string; dir: boolean; size: number; modified: number }
export interface WorldInfo { levelName: string; folders: { name: string; size: number }[]; datapacks: string[]; seed: string }

export interface TailscaleInfo {
  installed: boolean
  running: boolean
  loggedIn: boolean
  ip: string | null
  dnsName: string | null
  hostName: string | null
  firewallReady: boolean
}

export interface FriendKitInfo {
  dir: string
  installer: string | null
  guide: string | null
  builtAt: number | null
  modCount: number
  mods: { slug: string; title: string; kind: string; version: string }[]
}

export interface PaperVersions { versions: string[]; latest: string }
export interface SetupOptions {
  mode: 'new' | 'existing'
  dir: string
  serverName: string
  mcVersion: string
  memoryGB: number
  offlineMode: boolean
  plugins: string[]
  acceptEula: boolean
  motd: string
  maxPlayers: number
}

export interface TaskProgress { task: string; label: string; done: number; total: number; finished?: boolean; error?: string }

export interface SystemInfo { totalMemGB: number; platform: string; appVersion: string; userData: string }

/** Every method the renderer may call. Implemented in src/main/api.ts. */
export interface NexusApi {
  // app
  getSettings(): Promise<AppSettings>
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  systemInfo(): Promise<SystemInfo>
  pickFolder(title: string): Promise<string | null>
  pickFile(title: string, extensions: string[]): Promise<string | null>
  openPath(p: string): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  // setup
  paperVersions(): Promise<PaperVersions>
  findJava(minimum: number): Promise<JavaInfo | null>
  javaMinimum(mcVersion: string): Promise<number>
  installJava(major: number): Promise<void>
  inspectFolder(dir: string): Promise<ServerInfo>
  runSetup(opts: SetupOptions): Promise<void>
  // server
  serverInfo(): Promise<ServerInfo>
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  kill(): Promise<void>
  sendCommand(cmd: string): Promise<void>
  getLogs(): Promise<LogLine[]>
  getStats(): Promise<ServerStats>
  // options
  getProperties(): Promise<Record<string, string>>
  setProperties(patch: Record<string, string>): Promise<void>
  setOfflineMode(offline: boolean, renames: Record<string, string>): Promise<string[]>
  setServerIcon(fromFile: string | null, text: string | null): Promise<string>
  serverIconData(): Promise<string | null>
  // players
  players(): Promise<PlayerLists>
  playerAction(action: 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'kick' | 'ban' | 'pardon' | 'pardon-ip', name: string, reason?: string): Promise<void>
  setWhitelistEnabled(on: boolean): Promise<void>
  // software
  paperBuilds(version: string): Promise<{ id: number; channel: string; time: string }[]>
  updatePaper(version: string): Promise<{ build: number; jar: string }>
  // plugins
  plugins(): Promise<PluginInfo[]>
  searchPlugins(query: string): Promise<ModrinthHit[]>
  installPlugin(slug: string): Promise<string>
  updatePlugin(file: string): Promise<string>
  setPluginEnabled(file: string, enabled: boolean): Promise<void>
  removePlugin(file: string): Promise<void>
  // worlds
  worldInfo(): Promise<WorldInfo>
  importWorld(source: string): Promise<void>
  exportWorld(): Promise<string | null>
  resetWorld(seed: string): Promise<void>
  addDatapack(file: string): Promise<void>
  removeDatapack(name: string): Promise<void>
  // backups
  backups(): Promise<BackupInfo[]>
  createBackup(): Promise<BackupInfo>
  restoreBackup(file: string): Promise<void>
  deleteBackup(file: string): Promise<void>
  // files and logs
  listFiles(rel: string): Promise<FileEntry[]>
  readFile(rel: string): Promise<string>
  writeFile(rel: string, content: string): Promise<void>
  logFiles(): Promise<FileEntry[]>
  readLog(rel: string): Promise<string>
  // friends / network
  tailscale(): Promise<TailscaleInfo>
  setupFirewall(): Promise<boolean>
  friendKit(): Promise<FriendKitInfo>
  buildFriendKit(refreshMods: boolean): Promise<FriendKitInfo>
}

export type NexusEvent =
  | { type: 'log'; lines: LogLine[] }
  | { type: 'stats'; stats: ServerStats }
  | { type: 'progress'; progress: TaskProgress }
  | { type: 'toast'; kind: 'info' | 'success' | 'error'; text: string }
