import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import pidusage from 'pidusage'
import type { LogLine, ServerStats } from '@shared/types'
import { getSettings } from './settings'
import { readProperties } from './properties'
import { findPaperJar } from './paper'
import { portInUse, run, sleep } from './util'

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|§[0-9a-fk-or]/gi
const MAX_LINES = 3000

/**
 * Runs the Paper server as a child process. Emits:
 *   'log'   (LogLine[])   new console lines
 *   'stats' (ServerStats) whenever state, players or resource use change
 */
export class ServerManager extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private lines: LogLine[] = []
  private nextId = 1
  private pending: LogLine[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private statsTimer: NodeJS.Timeout | null = null
  private tpsTimer: NodeJS.Timeout | null = null
  private stopTimer: NodeJS.Timeout | null = null
  private crashTimes: number[] = []
  private hideTpsUntil = 0
  private waiters: { re: RegExp; resolve: (l: string) => void }[] = []
  private userStopped = false
  private heapTick = 0
  stats: ServerStats = { state: 'stopped', pid: null, startedAt: null, cpu: null, memoryMB: null, heapUsedMB: null, heapMaxMB: null, tps: null, players: [], maxPlayers: 20, lastExitCode: null, emptySince: null }

  get running() { return this.proc !== null }
  getLogs() { return this.lines }

  private setStats(patch: Partial<ServerStats>) {
    this.stats = { ...this.stats, ...patch }
    this.emit('stats', this.stats)
  }

  private push(text: string, level: LogLine['level']) {
    const l: LogLine = { id: this.nextId++, time: Date.now(), text, level }
    this.lines.push(l)
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES)
    this.pending.push(l)
    if (!this.flushTimer) this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const batch = this.pending; this.pending = []
      this.emit('log', batch)
    }, 80)
  }

  system(text: string) { this.push(text, 'system') }

  /** Checks for a server we didn't start (e.g. start.bat in a terminal) on the configured port. */
  async detectExternal(): Promise<boolean> {
    if (this.proc) return false
    const dir = getSettings().serverDir
    if (!dir) return false
    const props = await readProperties(dir)
    const ext = await portInUse(Number(props['server-port'] || 25565))
    if (ext && this.stats.state !== 'external') this.setStats({ state: 'external' })
    if (!ext && this.stats.state === 'external') this.setStats({ state: 'stopped' })
    return ext
  }

  async start(): Promise<void> {
    if (this.proc) return
    const s = getSettings()
    const dir = s.serverDir
    if (!dir || !existsSync(dir)) throw new Error('The server folder is missing. Run setup again from Settings.')
    if (await this.detectExternal()) throw new Error('A server is already running on this port outside NexusHost. Stop it there first (type "stop" in its window).')
    const eula = path.join(dir, 'eula.txt')
    if (!existsSync(eula) || !/^\s*eula\s*=\s*true/im.test(readFileSync(eula, 'utf8'))) throw new Error('The Minecraft EULA has not been accepted. Accept it in Options first.')
    const jar = findPaperJar(dir)
    if (!jar) throw new Error('No Paper jar found in the server folder. Install one from the Software page.')
    if (!s.javaPath || !existsSync(s.javaPath)) throw new Error('Java was not found. Pick it again in Settings.')
    const props = await readProperties(dir)

    const mem = `${s.memoryGB}G`
    const args = [`-Xms${mem}`, `-Xmx${mem}`, ...s.javaFlags, '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dterminal.jline=false', '-Dterminal.ansi=false', '-jar', jar.jar, '--nogui']
    this.userStopped = false
    this.system(`Starting ${jar.jar} with ${mem} RAM`)
    const p = spawn(s.javaPath, args, { cwd: dir, windowsHide: true })
    this.proc = p
    this.setStats({ state: 'starting', pid: p.pid ?? null, startedAt: Date.now(), players: [], tps: null, cpu: null, memoryMB: null, heapUsedMB: null, heapMaxMB: null, lastExitCode: null, maxPlayers: Number(props['max-players'] || 20), emptySince: null })

    let buf = ''
    const onData = (d: Buffer, isErr: boolean) => {
      buf += d.toString('utf8')
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() ?? ''
      for (const raw of parts) this.onLine(raw.replace(ANSI, ''), isErr)
    }
    p.stdout.on('data', (d) => onData(d, false))
    p.stderr.on('data', (d) => onData(d, true))
    p.on('error', (e) => { this.system(`Could not start Java: ${e.message}`) })
    p.on('close', (code) => this.onExit(code))

    this.statsTimer = setInterval(() => this.sample(), 2000)
    this.tpsTimer = setInterval(() => { if (this.stats.state === 'online') { this.hideTpsUntil = Date.now() + 3000; this.write('tps') } }, 15000)
  }

  private onLine(text: string, isErr: boolean) {
    if (!text.trim()) return
    // TPS polling output is hidden from the console
    const tps = /TPS from last 1m, 5m, 15m:\s*\*?([\d.]+)/.exec(text)
    if (tps) {
      this.setStats({ tps: Number(tps[1]) })
      if (Date.now() < this.hideTpsUntil) return
    }
    const level: LogLine['level'] = /\bERROR\]|\bSEVERE\b|Exception|^\s+at /.test(text) || isErr ? 'error' : /\bWARN\]/.test(text) ? 'warn' : 'info'
    this.push(text, level)
    for (const w of [...this.waiters]) if (w.re.test(text)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(text) }

    if (/Done \([\d.,]+s\)!/.test(text)) {
      this.setStats({ state: 'online', emptySince: Date.now() })
      this.hideTpsUntil = Date.now() + 3000; this.write('tps')
    }
    const join = /\]: (?:System chat: )?([A-Za-z0-9_]{1,16}) joined the game/.exec(text)
    if (join && !this.stats.players.includes(join[1])) this.setStats({ players: [...this.stats.players, join[1]], emptySince: null })
    const left = /\]: (?:System chat: )?([A-Za-z0-9_]{1,16}) left the game/.exec(text)
    if (left) {
      const players = this.stats.players.filter((n) => n !== left[1])
      this.setStats({ players, emptySince: players.length ? null : Date.now() })
    }
  }

  private async sample() {
    const p = this.proc
    if (!p?.pid) return
    try {
      const u = await pidusage(p.pid)
      this.setStats({ cpu: Math.round(u.cpu / Math.max(1, (await import('node:os')).cpus().length)), memoryMB: Math.round(u.memory / 1048576) })
    } catch { /* process gone */ }
    if (++this.heapTick % 5 === 1) this.sampleHeap(p.pid).catch(() => {})
    // auto-stop when nobody has been online for a while
    const mins = getSettings().autoStopMinutes
    if (mins > 0 && this.stats.state === 'online' && this.stats.emptySince && Date.now() - this.stats.emptySince > mins * 60000) {
      this.system(`Nobody online for ${mins} minutes. Stopping the server (auto-stop).`)
      this.stop().catch(() => {})
    }
  }

  /** Heap in use vs. allocated, via jcmd next to the java.exe that runs the server (JDKs ship it; JREs don't). */
  private async sampleHeap(pid: number) {
    const java = getSettings().javaPath
    if (!java) return
    const jcmd = path.join(path.dirname(java), 'jcmd.exe')
    if (!existsSync(jcmd)) return
    const r = await run(jcmd, [String(pid), 'GC.heap_info'], { timeoutMs: 8000 })
    const m = /total (?:reserved )?(\d+)K, committed (\d+)K, used (\d+)K/.exec(r.stdout)
    if (!m || this.proc?.pid !== pid) return
    this.setStats({ heapUsedMB: Math.round(Number(m[3]) / 1024), heapMaxMB: Math.round(Number(m[1]) / 1024) })
  }

  private onExit(code: number | null) {
    const wasStopping = this.userStopped
    this.proc = null
    for (const t of [this.statsTimer, this.tpsTimer, this.stopTimer]) if (t) clearInterval(t)
    this.statsTimer = this.tpsTimer = this.stopTimer = null
    pidusage.clear()
    const crashed = !wasStopping && code !== 0
    this.system(crashed ? `Server stopped unexpectedly (exit code ${code}).` : 'Server stopped.')
    this.setStats({ state: crashed ? 'crashed' : 'stopped', pid: null, players: [], tps: null, cpu: null, memoryMB: null, heapUsedMB: null, heapMaxMB: null, startedAt: null, lastExitCode: code, emptySince: null })
    if (crashed && getSettings().autoRestart) {
      const now = Date.now()
      this.crashTimes = this.crashTimes.filter((t) => now - t < 10 * 60000).concat(now)
      if (this.crashTimes.length > 3) { this.system('Crashed 3 times in 10 minutes. Not restarting again; check the console above.'); return }
      this.system('Restarting in 10 seconds...')
      setTimeout(() => { if (!this.proc && this.stats.state === 'crashed') this.start().catch((e) => this.system(String(e.message ?? e))) }, 10000)
    }
  }

  write(cmd: string) { if (this.proc) this.proc.stdin.write(cmd + '\n') }

  sendCommand(cmd: string) {
    const c = cmd.trim().replace(/^\//, '')
    if (!c) return
    if (!this.proc) throw new Error('The server is not running.')
    if (/^tps\b/i.test(c)) this.hideTpsUntil = 0
    this.push('> ' + c, 'command')
    if (/^(stop|end)\b/i.test(c)) { this.stop().catch(() => {}); return }
    this.write(c)
  }

  /** Resolves with the first console line matching re, or null after timeoutMs. */
  waitFor(re: RegExp, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const w = { re, resolve: (l: string) => { clearTimeout(t); resolve(l) } }
      const t = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); resolve(null) }, timeoutMs)
      this.waiters.push(w)
    })
  }

  private stopping: Promise<void> | null = null

  /** Stops the server cleanly. Calling it again while it is stopping waits for the same shutdown. */
  stop(): Promise<void> {
    if (!this.proc) return Promise.resolve()
    if (this.stopping) return this.stopping
    const p = this.proc
    this.userStopped = true
    this.setStats({ state: 'stopping' })
    this.stopping = new Promise<void>((res) => p.once('close', () => { this.stopping = null; res() }))
    this.write('stop')
    this.stopTimer = setTimeout(() => { if (this.proc === p) { this.system('The server did not stop within 90 seconds. Forcing it to close.'); p.kill() } }, 90000)
    return this.stopping
  }

  async restart(): Promise<void> {
    await this.stop()
    await sleep(1500)
    await this.start()
  }

  kill() { if (this.proc) { this.userStopped = true; this.proc.kill() } }

  /** Clears console and stats after switching to another server. Only call while nothing is running. */
  reset() {
    if (this.proc) return
    this.lines = []
    this.crashTimes = []
    this.emit('log', [])
    this.setStats({ state: 'stopped', pid: null, startedAt: null, cpu: null, memoryMB: null, heapUsedMB: null, heapMaxMB: null, tps: null, players: [], lastExitCode: null, emptySince: null })
    this.system(`Switched to ${getSettings().serverName}.`)
  }
}

export const server = new ServerManager()
