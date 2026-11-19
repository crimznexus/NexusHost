// Types shared by the main process, preload and renderer.

/** Server software. Paper runs plugins; Fabric, NeoForge and Forge run mods; Vanilla runs neither. */
export type Loader = 'paper' | 'fabric' | 'neoforge' | 'forge' | 'vanilla'

export type ServerState = 'stopped' | 'starting' | 'online' | 'stopping' | 'crashed' | 'external'

/** One server NexusHost knows about. The active one is mirrored into the top-level AppSettings fields. */
export interface SavedServer {
  id: string
  name: string
  dir: string
  loader: Loader
  mcVersion: string
  memoryGB: number
  javaPath: string | null
  javaFlags: string[]
  iconText: string
  backups: { daily: boolean; keep: number; lastRun: string | null }
}

export interface AppSettings {
  servers: SavedServer[]
  activeServerId: string | null
  serverDir: string | null
  serverName: string
  loader: Loader
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
  /** What starts the server (a jar name, or the loader's argument file), null if no server software is installed. */
  jar: string | null
  loader: Loader | null
  /** Paper build number, or the Fabric/NeoForge/Forge loader version. */
  loaderVersion: string | null
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

export interface GuardLock { name: string; userId: string; tailscaleLogin: string; tailscaleName: string; device: string; lockedAt: string }
export interface GuardInfo { supported: boolean; installed: boolean; locks: GuardLock[] }

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
  /** Mods only: players need it installed too (from Modrinth's client_side). */
  clientNeeded?: boolean
}

export interface ModrinthHit {
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  icon_url: string | null
  categories: string[]
  client_side?: string
  server_side?: string
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
  /** bat: one-click installer for the official launcher. mrpack: modpack file for Prism Launcher, Modrinth App, CurseForge and others. */
  kind: 'bat' | 'mrpack'
  /** Mods from the server that players must have. */
  serverMods: number
  modCount: number
  mods: { slug: string; title: string; kind: string; version: string }[]
}

export interface PaperVersions { versions: string[]; latest: string }
export interface SoftwareStatus { loader: Loader; mcVersion: string; latest: string | null; builds: { id: string; channel: string; time: string | null }[] }
export interface SetupOptions {
  mode: 'new' | 'existing'
  loader: Loader
  dir: string
  serverName: string
  mcVersion: string
  memoryGB: number
  offlineMode: boolean
  plugins: string[]
  acceptEula: boolean
  motd: string
  maxPlayers: number
  /** A world zip or folder to start with; null generates a new world (optionally from seed). */
  worldSource?: string | null
  seed?: string
}

export interface WorldCheck { ok: boolean; name: string; size: number; message: string }

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
  mcVersions(loader: Loader): Promise<PaperVersions>
  findJava(minimum: number): Promise<JavaInfo | null>
  javaMinimum(mcVersion: string, loader: Loader): Promise<number>
  installJava(major: number): Promise<void>
  inspectFolder(dir: string): Promise<ServerInfo>
  checkWorld(source: string): Promise<WorldCheck>
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
  serverIconData(dir?: string): Promise<string | null>
  // server list
  switchServer(id: string): Promise<AppSettings>
  removeServer(id: string): Promise<AppSettings>
  renameServer(id: string, name: string): Promise<AppSettings>
  // players
  players(): Promise<PlayerLists>
  playerAction(action: 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'kick' | 'ban' | 'pardon' | 'pardon-ip', name: string, reason?: string): Promise<void>
  setWhitelistEnabled(on: boolean): Promise<void>
  guard(): Promise<GuardInfo>
  installGuard(): Promise<string[]>
  unlockName(name: string): Promise<void>
  // software
  software(mcVersion: string): Promise<SoftwareStatus>
  installSoftware(mcVersion: string): Promise<string>
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
