// Dev-only fake backend so the UI can be reviewed in a normal browser. Never bundled in production
// because api.ts imports it only when import.meta.env.DEV is true.
import type { AppSettings, LogLine, NexusEvent, ServerStats } from '@shared/types'

const listeners = new Set<(e: NexusEvent) => void>()
const emit = (e: NexusEvent) => listeners.forEach((l) => l(e))
let id = 1
const line = (text: string, level: LogLine['level'] = 'info'): LogLine => ({ id: id++, time: Date.now(), text, level })
const logs: LogLine[] = [
  line('[21:00:46 INFO]: Loading Paper 26.3-253 for Minecraft 26.3'),
  line('[21:00:59 INFO]: [BlueMap] Enabling BlueMap v5.29'),
  line('[21:01:01 WARN]: **** SERVER IS RUNNING IN OFFLINE/INSECURE MODE!', 'warn'),
  line('[21:01:04 INFO]: Done (22.361s)! For help, type "help"'),
  line('[21:03:12 INFO]: System chat: steve joined the game'),
  line('> list', 'command'),
  line('[21:03:20 INFO]: There are 2 of a max of 12 players online: steve, alex')
]
const setup = new URLSearchParams(location.search).has('setup')
let settings: AppSettings = {
  serverDir: setup ? null : 'C:\\Servers\\friends', serverName: 'Friends Server', mcVersion: '26.3', memoryGB: 8, javaPath: 'C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe', javaFlags: [],
  iconText: 'NEXUS', autoStartServer: false, startWithWindows: false, closeToTray: true, autoRestart: true, autoStopMinutes: 0, backups: { daily: true, keep: 7, lastRun: new Date().toISOString() }
}
let stats: ServerStats = { state: 'online', pid: 1234, startedAt: Date.now() - 3600_000 * 2.3, cpu: 14, memoryMB: 5120, tps: 19.9, players: ['steve', 'alex'], maxPlayers: 12, lastExitCode: null, emptySince: null }
const props: Record<string, string> = { motd: 'Friends Server', 'max-players': '12', difficulty: 'easy', gamemode: 'survival', pvp: 'true', 'white-list': 'true', 'online-mode': 'false', 'view-distance': '10', 'simulation-distance': '8', 'spawn-protection': '16', hardcore: 'false', 'allow-flight': 'false', 'level-seed': '', 'server-port': '25565' }

const impl: Record<string, (...a: any[]) => any> = {
  getSettings: () => settings,
  saveSettings: (p: Partial<AppSettings>) => (settings = { ...settings, ...p }),
  systemInfo: () => ({ totalMemGB: 16, platform: 'win32', appVersion: '2.0.0', userData: 'C:\\Users\\you\\AppData\\Roaming\\NexusHost' }),
  pickFolder: () => 'C:\\Servers\\new', pickFile: () => null, openPath: () => {}, openExternal: () => {}, copyText: (t: string) => navigator.clipboard?.writeText(t),
  paperVersions: () => ({ versions: ['26.3', '26.2', '26.1.2', '1.21.11', '1.21.10'], latest: '26.3' }),
  findJava: () => ({ path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe', major: 25 }),
  javaMinimum: () => 25, installJava: () => {},
  inspectFolder: (dir: string) => ({ dir, exists: true, jar: null, paperBuild: null, mcVersion: null, eulaAccepted: false, onlineMode: true, levelName: 'world', port: 25565, hasWorld: false }),
  runSetup: async () => {
    for (let i = 0; i <= 5; i++) { emit({ type: 'progress', progress: { task: 'setup', label: ['Checking Java', 'Downloading Paper 26.3', 'Installing plugins', 'Writing server settings', 'Accepting the EULA', 'Saving'][i] ?? 'Done', done: i, total: 6 } }); await new Promise((r) => setTimeout(r, 400)) }
    settings = { ...settings, serverDir: 'C:\\Servers\\new' }
    emit({ type: 'progress', progress: { task: 'setup', label: 'Done', done: 6, total: 6, finished: true } })
  },
  serverInfo: () => ({ dir: settings.serverDir, exists: true, jar: 'paper-26.3-253.jar', paperBuild: 253, mcVersion: '26.3', eulaAccepted: true, onlineMode: false, levelName: 'world', port: 25565, hasWorld: true }),
  start: async () => { stats = { ...stats, state: 'starting' }; emit({ type: 'stats', stats }); await new Promise((r) => setTimeout(r, 1500)); stats = { ...stats, state: 'online', startedAt: Date.now() }; emit({ type: 'stats', stats }) },
  stop: async () => { stats = { ...stats, state: 'stopping' }; emit({ type: 'stats', stats }); await new Promise((r) => setTimeout(r, 1200)); stats = { ...stats, state: 'stopped', players: [], cpu: null, memoryMB: null, tps: null }; emit({ type: 'stats', stats }) },
  restart: () => {}, kill: () => {},
  sendCommand: (c: string) => { const l = [line('> ' + c, 'command')]; logs.push(...l); emit({ type: 'log', lines: l }) },
  getLogs: () => logs, getStats: () => stats,
  getProperties: () => props, setProperties: (p: Record<string, string>) => Object.assign(props, p),
  setOfflineMode: () => ['steve: data moved', 'Switched to offline mode.'], setServerIcon: () => 'ok', serverIconData: () => null,
  players: () => ({ online: stats.players, whitelist: [{ uuid: 'a', name: 'steve' }, { uuid: 'b', name: 'alex' }, { uuid: 'c', name: 'a_really_long_player_name' }], ops: [{ uuid: 'a', name: 'steve', level: 4 }], banned: [], bannedIps: [], known: [], whitelistEnabled: true, onlineMode: false }),
  playerAction: () => {}, setWhitelistEnabled: () => {},
  paperBuilds: () => [{ id: 253, channel: 'STABLE', time: '2026-11-15T17:14:05Z' }, { id: 252, channel: 'STABLE', time: '2026-11-14T10:00:00Z' }],
  updatePaper: () => ({ build: 253, jar: 'paper-26.3-253.jar' }),
  plugins: () => [
    { file: 'bluemap-5.29-paper.jar', enabled: true, name: 'BlueMap', version: '5.29', description: 'A 3D map of your world in the browser', authors: ['Blue'], slug: 'bluemap', latestVersion: null, updateFile: null },
    { file: 'Chunky-Paper-1.5.66.jar', enabled: true, name: 'Chunky', version: '1.5.66', description: 'Pre-generates chunks', authors: ['pop4959'], slug: 'chunky', latestVersion: '1.5.70', updateFile: 'Chunky-Paper-1.5.70.jar' },
    { file: 'AuthMe-6.0.1-Paper.jar', enabled: false, name: 'AuthMe', version: '6.0.1', description: '', authors: [], slug: 'authmereloaded', latestVersion: null, updateFile: null }
  ],
  searchPlugins: () => [{ slug: 'worldedit', title: 'WorldEdit', description: 'An in-game Minecraft map editor for builders.', author: 'EngineHub', downloads: 11974609, icon_url: null, categories: ['utility'] }, { slug: 'luckperms', title: 'LuckPerms', description: 'A permissions plugin for Minecraft servers.', author: 'Luck', downloads: 2000000, icon_url: null, categories: [] }],
  installPlugin: () => 'x.jar', updatePlugin: () => 'x.jar', setPluginEnabled: () => {}, removePlugin: () => {},
  worldInfo: () => ({ levelName: 'world', folders: [{ name: 'world', size: 812_000_000 }], datapacks: ['Dungeons and Taverns v6.1.0.zip'], seed: '' }),
  importWorld: () => {}, exportWorld: () => null, resetWorld: () => {}, addDatapack: () => {}, removeDatapack: () => {},
  backups: () => [{ file: 'auto-2026-11-18_21-00-00.zip', name: 'auto-2026-11-18_21-00-00', size: 640_000_000, created: Date.now() - 3600_000, auto: true }, { file: 'backup-2026-11-17_18-30-00.zip', name: 'backup-2026-11-17_18-30-00', size: 630_000_000, created: Date.now() - 86400_000, auto: false }],
  createBackup: async () => { await new Promise((r) => setTimeout(r, 800)); return { file: 'b.zip', name: 'b', size: 1, created: Date.now(), auto: false } },
  restoreBackup: () => {}, deleteBackup: () => {},
  listFiles: (rel: string) => rel ? [{ name: 'config.yml', rel: rel + '/config.yml', dir: false, size: 2048, modified: Date.now() }] : [
    { name: 'plugins', rel: 'plugins', dir: true, size: 0, modified: Date.now() }, { name: 'world', rel: 'world', dir: true, size: 0, modified: Date.now() },
    { name: 'server.properties', rel: 'server.properties', dir: false, size: 1818, modified: Date.now() }, { name: 'whitelist.json', rel: 'whitelist.json', dir: false, size: 261, modified: Date.now() }],
  readFile: () => 'motd=Friends Server\nmax-players=12\n', writeFile: () => {},
  logFiles: () => [{ name: 'latest.log', rel: 'logs/latest.log', dir: false, size: 20000, modified: Date.now() }], readLog: () => logs.map((l) => l.text).join('\n'),
  tailscale: () => ({ installed: true, running: true, loggedIn: true, ip: '100.101.102.103', dnsName: 'host-pc.tail1234.ts.net', hostName: 'host-pc', firewallReady: true }),
  setupFirewall: () => true,
  friendKit: () => ({ dir: 'C:\\Users\\you\\AppData\\Roaming\\NexusHost\\friend-kit', installer: null, guide: null, builtAt: null, modCount: 42, mods: [{ slug: 'sodium', title: 'Sodium', kind: 'mod', version: '0.7' }, { slug: 'xaeros-minimap', title: "Xaero's Minimap", kind: 'mod', version: '25.2' }] }),
  buildFriendKit: () => ({ dir: 'C:\\kit', installer: 'C:\\kit\\Install-FriendsServer-Mods.bat', guide: 'C:\\kit\\FRIENDS-GUIDE.md', builtAt: Date.now(), modCount: 42, mods: [] })
}

export const mockBridge = {
  invoke: async (m: string, ...a: unknown[]) => { await new Promise((r) => setTimeout(r, 120)); if (!impl[m]) throw new Error(`mock: ${m}`); return impl[m](...a) },
  on: (cb: (e: NexusEvent) => void) => { listeners.add(cb); return () => listeners.delete(cb) }
}
