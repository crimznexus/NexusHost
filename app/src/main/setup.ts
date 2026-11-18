import { existsSync, promises as fsp, readFileSync } from 'node:fs'
import path from 'node:path'
import { nativeImage } from 'electron'
import type { ServerInfo, SetupOptions, TaskProgress } from '@shared/types'
import { findPaperJar, installPaper, paperVersionMeta } from './paper'
import { readProperties, writeProperties } from './properties'
import { installPlugin } from './plugins'
import { findJava } from './java'
import { saveSettings } from './settings'
import { resourcePath, run } from './util'

export async function inspectFolder(dir: string): Promise<ServerInfo> {
  const exists = existsSync(dir)
  const jar = exists ? findPaperJar(dir) : null
  const props = exists ? await readProperties(dir) : {}
  const eula = path.join(dir, 'eula.txt')
  const level = props['level-name'] || 'world'
  return {
    dir, exists, jar: jar?.jar ?? null, paperBuild: jar?.build ?? null, mcVersion: jar?.version ?? null,
    eulaAccepted: existsSync(eula) && /^\s*eula\s*=\s*true/im.test(readFileSync(eula, 'utf8')),
    onlineMode: props['online-mode'] !== 'false', levelName: level, port: Number(props['server-port'] || 25565),
    hasWorld: existsSync(path.join(dir, level, 'level.dat'))
  }
}

export async function acceptEula(dir: string) {
  await fsp.writeFile(path.join(dir, 'eula.txt'), `# Accepted by the server owner in NexusHost on ${new Date().toISOString()}\n# https://aka.ms/MinecraftEULA\neula=true\n`, 'utf8')
}

/** Draws the default icon with make-icon.ps1 (Windows PowerShell), or converts a picked image to 64x64. */
export async function makeServerIcon(dir: string, fromFile: string | null, text: string | null): Promise<string> {
  const out = path.join(dir, 'server-icon.png')
  if (fromFile) {
    const img = nativeImage.createFromPath(fromFile)
    if (img.isEmpty()) throw new Error('That file is not a readable image.')
    await fsp.writeFile(out, img.resize({ width: 64, height: 64, quality: 'best' }).toPNG())
    return out
  }
  const t = (text || 'NEXUS').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 7) || 'NEXUS'
  const r = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resourcePath('make-icon.ps1'), '-Text', t, '-Out', out, '-Preview', path.join(dir, 'server-icon-preview.png')], { timeoutMs: 60000 })
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).split('\n').find((l) => l.includes('make-icon')) || 'Could not draw the icon.')
  await fsp.rm(path.join(dir, 'server-icon-preview.png'), { force: true })
  return out
}

/** First-run setup for a new folder, or adopting an existing server folder. */
export async function runSetup(o: SetupOptions, progress: (p: TaskProgress) => void): Promise<void> {
  const steps = o.mode === 'new' ? 6 : 4
  let n = 0
  const step = (label: string) => progress({ task: 'setup', label, done: n++, total: steps })
  await fsp.mkdir(o.dir, { recursive: true })
  const existing = await inspectFolder(o.dir)

  step('Checking Java')
  const meta = await paperVersionMeta(o.mcVersion)
  const java = await findJava(meta.javaMin)
  if (!java) throw new Error(`Java ${meta.javaMin} or newer is needed. Use "Install Java" and try again.`)

  if (o.mode === 'new' || !existing.jar) {
    step(`Downloading Paper ${o.mcVersion}`)
    await installPaper(o.dir, o.mcVersion, (d, t) => progress({ task: 'setup', label: `Downloading Paper ${o.mcVersion} (${Math.round(d / 1048576)} / ${Math.round(t / 1048576)} MB)`, done: n - 1, total: steps }))
  }

  if (o.mode === 'new') {
    step('Installing plugins')
    const failed: string[] = []
    for (const slug of o.plugins) {
      progress({ task: 'setup', label: `Installing plugin: ${slug}`, done: n - 1, total: steps })
      try { await installPlugin(o.dir, slug, o.mcVersion) } catch { failed.push(slug) }
    }
    if (failed.length) progress({ task: 'setup', label: `Skipped (no ${o.mcVersion} version yet): ${failed.join(', ')}`, done: n - 1, total: steps })

    step('Writing server settings')
    if (!existsSync(path.join(o.dir, 'server.properties'))) {
      await writeProperties(o.dir, {
        motd: o.motd || o.serverName, 'max-players': String(o.maxPlayers), 'server-port': '25565',
        'online-mode': String(!o.offlineMode), 'enforce-secure-profile': String(!o.offlineMode),
        'white-list': 'true', 'enforce-whitelist': 'true', 'view-distance': '10', 'simulation-distance': '8', difficulty: 'easy'
      })
    }
    if (!existsSync(path.join(o.dir, 'server-icon.png'))) await makeServerIcon(o.dir, null, o.serverName.split(/\s+/)[0]).catch(() => {})
  }

  step('Accepting the EULA')
  if (o.acceptEula) await acceptEula(o.dir)

  step('Saving')
  const jar = findPaperJar(o.dir)
  // activeServerId null: becomes a new list entry (or the existing entry for this folder), not a rename of the current one
  saveSettings({ activeServerId: null, serverDir: o.dir, serverName: o.serverName, mcVersion: jar?.version ?? o.mcVersion, memoryGB: o.memoryGB, javaPath: java.path, javaFlags: meta.flags })
  progress({ task: 'setup', label: 'Done', done: steps, total: steps, finished: true })
}

export function appIcon() {
  const p = resourcePath('icon.png')
  return existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
}
