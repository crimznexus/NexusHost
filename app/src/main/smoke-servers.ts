// Developer test for the server list (not shipped): migration from 2.0 settings, add, switch, rename, remove.
//   NEXUS_SMOKE_OUT=<dir with userdata/settings.json copied from a 2.0 install> NEXUS_SMOKE_DIR2=<second server folder>
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { app } from 'electron'

const out = process.env.NEXUS_SMOKE_OUT!
const dir2 = process.env.NEXUS_SMOKE_DIR2!
app.setPath('userData', path.join(out, 'userdata'))
const log: string[] = []
async function step(name: string, fn: () => Promise<string>) { try { log.push(`PASS ${name}: ${await fn()}`) } catch (e: any) { log.push(`FAIL ${name}: ${e.message}`) } }

app.whenReady().then(async () => {
  const { api } = await import('./api')
  try {
    let firstId = ''
    await step('migrate 2.0 settings', async () => {
      const s = await api.getSettings()
      if (s.servers.length !== 1 || !s.activeServerId) throw new Error(`servers=${s.servers.length}`)
      firstId = s.activeServerId
      const disk = JSON.parse(await fsp.readFile(path.join(out, 'userdata', 'settings.json'), 'utf8'))
      return `1 server "${s.servers[0].name}" (${s.servers[0].memoryGB} GB, ${s.servers[0].mcVersion}), written to disk: ${disk.servers?.length === 1}`
    })
    let secondId = ''
    await step('add second server (existing folder)', async () => {
      await api.runSetup({ mode: 'existing', loader: 'paper', dir: dir2, serverName: 'Second Server', mcVersion: '26.3', memoryGB: 3, offlineMode: false, plugins: [], acceptEula: true, motd: '', maxPlayers: 10 })
      const s = await api.getSettings()
      secondId = s.activeServerId!
      if (s.servers.length !== 2 || secondId === firstId) throw new Error(`servers=${s.servers.length}`)
      const first = s.servers.find((x) => x.id === firstId)!
      return `now ${s.servers.length} servers, active "${s.serverName}" ${s.memoryGB} GB; first kept "${first.name}" ${first.memoryGB} GB at ${first.dir}`
    })
    await step('per-server settings stay separate', async () => {
      await api.saveSettings({ memoryGB: 5 })
      const s = await api.switchServer(firstId)
      const second = s.servers.find((x) => x.id === secondId)!
      if (second.memoryGB !== 5) throw new Error('second server lost its memory setting')
      return `switched to "${s.serverName}" (${s.memoryGB} GB, dir ${s.serverDir}); second remembers ${second.memoryGB} GB`
    })
    await step('server info follows the switch', async () => { const i = await api.serverInfo(); return `${i.dir} jar ${i.jar}` })
    await step('re-adding the same folder does not duplicate', async () => {
      await api.runSetup({ mode: 'existing', loader: 'paper', dir: dir2, serverName: 'Second Server', mcVersion: '26.3', memoryGB: 5, offlineMode: false, plugins: [], acceptEula: true, motd: '', maxPlayers: 10 })
      const s = await api.getSettings(); if (s.servers.length !== 2) throw new Error(`servers=${s.servers.length}`); return `still 2, active ${s.serverName}`
    })
    await step('rename inactive', async () => { const s = await api.renameServer(firstId, 'Renamed First'); return s.servers.find((x) => x.id === firstId)!.name })
    await step('remove active falls back', async () => {
      const s = await api.removeServer(secondId)
      if (s.servers.length !== 1 || s.activeServerId !== firstId) throw new Error(`active ${s.activeServerId}`)
      return `active now "${s.serverName}" at ${s.serverDir}`
    })
    await step('remove last goes to setup', async () => { const s = await api.removeServer(firstId); return `servers ${s.servers.length}, serverDir ${s.serverDir}` })
  } finally {
    await fsp.writeFile(path.join(out, 'servers-result.txt'), log.join('\n'))
    app.exit(0)
  }
})
