// Developer smoke test: drives the real backend API against a throwaway server folder, then screenshots
// the real window. Not part of the shipped app (built only by `npm run smoke`).
//   NEXUS_SMOKE_DIR=<server folder> NEXUS_SMOKE_OUT=<folder for results> npm run smoke
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { app, BrowserWindow } from 'electron'

const dir = process.env.NEXUS_SMOKE_DIR!
const out = process.env.NEXUS_SMOKE_OUT!
app.setPath('userData', path.join(out, 'userdata'))
app.on('window-all-closed', () => { /* keep running after the screenshot window closes */ })

const log: string[] = []
const ok = (name: string, detail = '') => { log.push(`PASS ${name}${detail ? ': ' + detail : ''}`) }
const bad = (name: string, e: unknown) => { log.push(`FAIL ${name}: ${(e as Error)?.message ?? e}`) }
async function step(name: string, fn: () => Promise<string | void>) { try { ok(name, (await fn()) || '') } catch (e) { bad(name, e) } }

app.whenReady().then(async () => {
  const { api } = await import('./api')
  const { server } = await import('./server')
  const { ipcMain } = await import('electron')
  ipcMain.handle('nexus:invoke', (_e, method: string, args: unknown[]) => (api as any)[method](...args))
  const lines: string[] = []
  server.on('log', (ls: { text: string }[]) => lines.push(...ls.map((l) => l.text)))
  try {
    await step('paperVersions', async () => { const v = await api.paperVersions(); return `latest ${v.latest}, ${v.versions.length} versions` })
    await step('inspectFolder', async () => { const i = await api.inspectFolder(dir); return `jar ${i.jar}, mc ${i.mcVersion}, eula ${i.eulaAccepted}, online ${i.onlineMode}` })
    await step('runSetup existing', async () => {
      const i = await api.inspectFolder(dir)
      await api.runSetup({ mode: 'existing', dir, serverName: 'Smoke Server', mcVersion: i.mcVersion!, memoryGB: 3, offlineMode: false, plugins: [], acceptEula: true, motd: '', maxPlayers: 10 })
      const s = await api.getSettings(); return `java ${s.javaPath}, flags ${s.javaFlags.length}`
    })
    await step('properties roundtrip', async () => { await api.setProperties({ motd: 'Smoke §test ü' }); const p = await api.getProperties(); if (p.motd !== 'Smoke §test ü') throw new Error(`motd came back as ${p.motd}`); return `port ${p['server-port']}` })
    await step('players (stopped)', async () => { await api.playerAction('whitelist-add', 'SmokeTester'); const p = await api.players(); if (!p.whitelist.some((w) => w.name === 'SmokeTester')) throw new Error('not added'); await api.playerAction('whitelist-remove', 'SmokeTester'); return `${p.whitelist.length} whitelisted, online mode ${p.onlineMode}` })
    await step('plugins list + update check', async () => { const ps = await api.plugins(); return ps.map((p) => `${p.name} ${p.version}${p.updateFile ? ' -> ' + p.latestVersion : ''}${p.slug ? ' [' + p.slug + ']' : ''}`).join(', ') })
    await step('plugin search', async () => { const h = await api.searchPlugins('worldedit'); return `${h.length} hits, first ${h[0]?.slug}` })
    await step('world info', async () => { const w = await api.worldInfo(); return `${w.folders.map((f) => `${f.name} ${Math.round(f.size / 1e6)}MB`).join(', ')}, datapacks ${w.datapacks.length}` })
    await step('backup while stopped', async () => { const b = await api.createBackup(); return `${b.file} ${Math.round(b.size / 1e6)}MB` })
    await step('tailscale', async () => { const t = await api.tailscale(); return `installed ${t.installed}, logged in ${t.loggedIn}, firewall ${t.firewallReady}` })
    await step('files', async () => { const f = await api.listFiles(''); const t = await api.readFile('server.properties'); return `${f.length} entries, props ${t.length} chars` })
    await step('logs', async () => { const l = await api.logFiles(); if (l[0]) await api.readLog(l[0].rel); return `${l.length} log files` })
    await step('path guard', async () => { try { await api.readFile('../../Windows/win.ini'); throw new Error('escaped the server folder') } catch (e: any) { if (/outside/.test(e.message)) return 'blocked'; throw e } })
    await step('friend kit build', async () => { const k = await api.buildFriendKit(false); return `${path.basename(k.installer ?? 'none')}, ${k.modCount} mods` })

    await step('server start -> online', async () => {
      await api.start()
      const t0 = Date.now()
      while (server.stats.state !== 'online' && Date.now() - t0 < 240000) { if (server.stats.state === 'crashed' || server.stats.state === 'stopped') throw new Error('server exited: ' + lines.slice(-5).join(' | ')); await new Promise((r) => setTimeout(r, 1000)) }
      if (server.stats.state !== 'online') throw new Error('timeout')
      return `online in ${Math.round((Date.now() - t0) / 1000)}s`
    })
    await step('console command', async () => { const w = server.waitFor(/There are \d+ of a max/, 10000); await api.sendCommand('list'); const l = await w; if (!l) throw new Error('no reply'); return l.replace(/^.*\]: /, '') })
    await step('tps + stats', async () => { await new Promise((r) => setTimeout(r, 5000)); const s = await api.getStats(); return `tps ${s.tps}, cpu ${s.cpu}%, mem ${s.memoryMB}MB` })
    await step('whitelist while running', async () => { await api.playerAction('whitelist-add', 'Notch'); await new Promise((r) => setTimeout(r, 2500)); const p = await api.players(); await api.playerAction('whitelist-remove', 'Notch'); return p.whitelist.some((w) => w.name === 'Notch') ? 'added via console' : 'not in file yet' })
    await step('backup while running', async () => { const b = await api.createBackup(); const saveOn = lines.some((l) => /save-on|Automatic saving is now enabled/i.test(l)); return `${b.file}, saving re-enabled ${saveOn}` })

    // real window screenshot while the server is online
    await step('window screenshot', async () => {
      const w = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true } })
      await w.loadFile(path.join(__dirname, '../renderer/index.html'))
      await new Promise((r) => setTimeout(r, 4000))
      await fsp.writeFile(path.join(out, 'window-dashboard.png'), (await w.webContents.capturePage()).toPNG())
      const errs = await w.webContents.executeJavaScript('document.body.innerText.slice(0, 300)')
      w.destroy()
      return String(errs).replace(/\s+/g, ' ').slice(0, 160)
    })

    await step('server stop', async () => { await api.stop(); return server.stats.state })
    await step('restore backup', async () => { const b = await api.backups(); await api.restoreBackup(b[b.length - 1].file); return `restored ${b[b.length - 1].file}, now ${(await api.backups()).length} backups` })
    await step('offline -> online -> offline', async () => {
      const r1 = await api.setOfflineMode(false, {}); const r2 = await api.setOfflineMode(true, {})
      return [...r1, ...r2].filter((l) => !/Backup:/.test(l)).join(' / ').slice(0, 300)
    })
  } finally {
    if (server.running) await server.stop()
    await fsp.writeFile(path.join(out, 'smoke-result.txt'), log.join('\n') + '\n\n--- last console lines ---\n' + lines.slice(-25).join('\n'))
    app.exit(0)
  }
})
