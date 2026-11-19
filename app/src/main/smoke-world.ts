// Developer test (not shipped): setup wizard path that starts a new server from a world zip.
//   NEXUS_SMOKE_OUT=<results dir> NEXUS_WORLD_ZIP=<world zip> NEXUS_BAD_ZIP=<zip without a world> NEXUS_NEW_DIR=<empty folder>
import path from 'node:path'
import { existsSync, promises as fsp } from 'node:fs'
import { app } from 'electron'

const out = process.env.NEXUS_SMOKE_OUT!
app.setPath('userData', path.join(out, 'userdata'))
const log: string[] = []
async function step(name: string, fn: () => Promise<string>) { try { log.push(`PASS ${name}: ${await fn()}`) } catch (e: any) { log.push(`FAIL ${name}: ${e.message}`) } }

app.whenReady().then(async () => {
  const { api } = await import('./api')
  const dir = process.env.NEXUS_NEW_DIR!
  try {
    await step('check good zip', async () => { const c = await api.checkWorld(process.env.NEXUS_WORLD_ZIP!); if (!c.ok) throw new Error(c.message); return `${c.message}, ${Math.round(c.size / 1e6)} MB` })
    await step('check zip without a world', async () => { const c = await api.checkWorld(process.env.NEXUS_BAD_ZIP!); if (c.ok) throw new Error('accepted a non-world zip'); return c.message })
    await step('new server from zip', async () => {
      await api.runSetup({ mode: 'new', loader: 'paper', dir, serverName: 'Zip World', mcVersion: '26.3', memoryGB: 2, offlineMode: true, plugins: [], acceptEula: true, motd: '', maxPlayers: 8, worldSource: process.env.NEXUS_WORLD_ZIP! })
      const lvl = path.join(dir, 'world', 'level.dat')
      if (!existsSync(lvl)) throw new Error('world/level.dat missing after setup')
      const s = await api.getSettings()
      return `world imported (${(await fsp.readdir(path.join(dir, 'world'))).length} entries), active "${s.serverName}", ${s.servers.length} servers`
    })
    await step('world info sees it', async () => { const w = await api.worldInfo(); return w.folders.map((f) => `${f.name} ${Math.round(f.size / 1e6)} MB`).join(', ') })
  } finally {
    await fsp.writeFile(path.join(out, 'world-result.txt'), log.join('\n'))
    app.exit(0)
  }
})
