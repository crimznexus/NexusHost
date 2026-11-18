import os from 'node:os'
import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import type { NexusApi, NexusEvent } from '@shared/types'
import { activateServer, forgetServer, getSettings, renameSaved, requireServerDir, saveSettings } from './settings'
import { server } from './server'
import { findPaperJar, installPaper, paperBuilds, paperVersionMeta, paperVersions } from './paper'
import { findJava, installJava } from './java'
import { readProperties, writeProperties } from './properties'
import { getPlayers, playerAction, setWhitelist, switchMode } from './players'
import { installPlugin, listPlugins, removePlugin, searchPlugins, setPluginEnabled, updatePlugin } from './plugins'
import * as worlds from './worlds'
import { listFiles, logFiles, readLog, readText, writeText } from './files'
import { setupFirewall, tailscaleInfo } from './network'
import { buildFriendKit, friendKitInfo } from './friendkit'
import { acceptEula, inspectFolder, makeServerIcon, runSetup } from './setup'
import { guardInfo, installGuard, unlock } from './guard'

export function emit(e: NexusEvent) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('nexus:event', e)
}

const DATA_VERSIONS: Record<string, number> = { '26.3': 5023 }

function mustBeStopped(what: string) {
  if (server.running) throw new Error(`Stop the server before ${what}.`)
}

const win = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

export const api: NexusApi = {
  async getSettings() { return getSettings() },
  async saveSettings(patch) { return saveSettings(patch) },
  async systemInfo() { return { totalMemGB: Math.round(os.totalmem() / 1073741824), platform: process.platform, appVersion: app.getVersion(), userData: app.getPath('userData') } },
  async pickFolder(title) { const r = await dialog.showOpenDialog(win(), { title, properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0] },
  async pickFile(title, extensions) { const r = await dialog.showOpenDialog(win(), { title, properties: ['openFile'], filters: [{ name: extensions.join(', '), extensions }] }); return r.canceled ? null : r.filePaths[0] },
  async openPath(p) { if (existsSync(p) && (await fsp.stat(p)).isDirectory()) await shell.openPath(p); else shell.showItemInFolder(p) },
  async openExternal(url) { if (/^https:\/\//.test(url)) await shell.openExternal(url) },
  async copyText(text) { clipboard.writeText(text) },

  async paperVersions() { return paperVersions() },
  async findJava(min) { return findJava(min) },
  async javaMinimum(v) { return (await paperVersionMeta(v)).javaMin },
  async installJava(major) { return installJava(major) },
  async inspectFolder(dir) { return inspectFolder(dir) },
  async checkWorld(src) { return worlds.checkWorldSource(src) },
  async runSetup(o) {
    mustBeStopped('changing the server setup')
    try { await runSetup(o, (progress) => emit({ type: 'progress', progress })) }
    catch (e: any) { emit({ type: 'progress', progress: { task: 'setup', label: e.message, done: 0, total: 1, finished: true, error: e.message } }); throw e }
  },

  async serverInfo() { const s = getSettings(); return inspectFolder(s.serverDir ?? '') },
  async start() { await server.start() },
  async stop() { await server.stop() },
  async restart() { await server.restart() },
  async kill() { server.kill() },
  async sendCommand(cmd) { server.sendCommand(cmd) },
  async getLogs() { return server.getLogs() },
  async getStats() { await server.detectExternal(); return server.stats },

  async getProperties() { return readProperties(requireServerDir()) },
  async setProperties(patch) {
    const dir = requireServerDir()
    if ('eula' in patch) { if (patch.eula === 'true') await acceptEula(dir); delete patch.eula }
    if ('online-mode' in patch) throw new Error('Use the offline mode switch, it also moves player saves.')
    await writeProperties(dir, patch)
  },
  async setOfflineMode(offline, renames) {
    mustBeStopped('switching offline mode')
    const dir = requireServerDir()
    const report = await switchMode(dir, offline, renames)
    // SkinsRestorer brings skins back in offline mode; NexusGuard stops players joining under each other's names
    if (offline) {
      try { await installPlugin(dir, 'skinsrestorer', getSettings().mcVersion); report.push('Installed SkinsRestorer so skins still show.') } catch { report.push('Could not install SkinsRestorer; skins will be default.') }
      report.push(...(await installGuard(dir, (await getPlayers(dir, [])).whitelist)))
    } else if (existsSync(path.join(dir, 'plugins', 'NexusGuard.jar'))) {
      await fsp.mkdir(path.join(dir, 'plugins-disabled'), { recursive: true })
      await fsp.rename(path.join(dir, 'plugins', 'NexusGuard.jar'), path.join(dir, 'plugins-disabled', 'NexusGuard.jar'))
      report.push('NexusGuard turned off: online mode already checks every account.')
    }
    return report
  },
  async setServerIcon(fromFile, text) { return makeServerIcon(requireServerDir(), fromFile, text) },
  async serverIconData(dir) {
    const base = dir && getSettings().servers.some((s) => path.resolve(s.dir) === path.resolve(dir)) ? dir : getSettings().serverDir
    const f = path.join(base ?? '', 'server-icon.png')
    return base && existsSync(f) ? 'data:image/png;base64,' + (await fsp.readFile(f)).toString('base64') : null
  },

  async switchServer(id) {
    if (server.running || server.stats.state === 'external') throw new Error('Stop the running server before switching to another one.')
    const s = activateServer(id)
    server.reset()
    await server.detectExternal()
    return s
  },
  async removeServer(id) {
    if (getSettings().activeServerId === id && server.running) throw new Error('Stop this server before removing it from the list.')
    const wasActive = getSettings().activeServerId === id
    const s = forgetServer(id)
    if (wasActive) server.reset()
    return s
  },
  async renameServer(id, name) {
    const n = name.trim().replace(/['"|%`]/g, '').slice(0, 40)
    if (!n) throw new Error('Give the server a name.')
    return renameSaved(id, n)
  },

  async players() { return getPlayers(requireServerDir(), server.stats.players) },
  async playerAction(action, name, reason) { await playerAction(requireServerDir(), server, action, name, reason) },
  async setWhitelistEnabled(on) { await setWhitelist(requireServerDir(), server, on) },
  async guard() { return guardInfo(requireServerDir()) },
  async installGuard() { const dir = requireServerDir(); return installGuard(dir, (await getPlayers(dir, [])).whitelist) },
  async unlockName(name) { await unlock(requireServerDir(), name) },

  async paperBuilds(v) { return (await paperBuilds(v)).slice(0, 15).map((b) => ({ id: b.id, channel: b.channel, time: b.time })) },
  async updatePaper(version) {
    mustBeStopped('changing the server software')
    const dir = requireServerDir()
    const cur = findPaperJar(dir)
    if (cur?.version && cur.version !== version) await worlds.createBackup(dir, server).catch(() => {})
    const r = await installPaper(dir, version, (d, t) => emit({ type: 'progress', progress: { task: 'paper', label: `Downloading Paper ${version}`, done: d, total: t } }))
    const meta = await paperVersionMeta(version)
    const java = await findJava(meta.javaMin)
    saveSettings({ mcVersion: version, javaFlags: meta.flags, ...(java ? { javaPath: java.path } : {}) })
    emit({ type: 'progress', progress: { task: 'paper', label: 'Done', done: 1, total: 1, finished: true } })
    if (!java) throw new Error(`Paper ${version} needs Java ${meta.javaMin}. Install it from Settings.`)
    return r
  },

  async plugins() { const s = getSettings(); return listPlugins(requireServerDir(), s.mcVersion, true) },
  async searchPlugins(q) { return searchPlugins(q, getSettings().mcVersion) },
  async installPlugin(slug) { return installPlugin(requireServerDir(), slug, getSettings().mcVersion) },
  async updatePlugin(file) { mustBeStopped('updating plugins'); return updatePlugin(requireServerDir(), file, getSettings().mcVersion) },
  async setPluginEnabled(file, enabled) { mustBeStopped('turning plugins on or off'); await setPluginEnabled(requireServerDir(), file, enabled) },
  async removePlugin(file) { mustBeStopped('removing plugins'); await removePlugin(requireServerDir(), file) },

  async worldInfo() { return worlds.worldInfo(requireServerDir()) },
  async importWorld(src) { await worlds.importWorld(requireServerDir(), server, src) },
  async exportWorld() {
    const r = await dialog.showSaveDialog(win(), { title: 'Save world as', defaultPath: `world-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: 'Zip', extensions: ['zip'] }] })
    if (r.canceled || !r.filePath) return null
    await worlds.exportWorld(requireServerDir(), server, r.filePath)
    return r.filePath
  },
  async resetWorld(seed) { await worlds.resetWorld(requireServerDir(), server, seed) },
  async addDatapack(file) { await worlds.addDatapack(requireServerDir(), file) },
  async removeDatapack(name) { await worlds.removeDatapack(requireServerDir(), name) },

  async backups() { return worlds.listBackups(requireServerDir()) },
  async createBackup() { return worlds.createBackup(requireServerDir(), server) },
  async restoreBackup(file) { await worlds.restoreBackup(requireServerDir(), server, file) },
  async deleteBackup(file) { await worlds.deleteBackup(requireServerDir(), file) },

  async listFiles(rel) { return listFiles(requireServerDir(), rel) },
  async readFile(rel) { return readText(requireServerDir(), rel) },
  async writeFile(rel, content) { await writeText(requireServerDir(), rel, content) },
  async logFiles() { return logFiles(requireServerDir()) },
  async readLog(rel) { return readLog(requireServerDir(), rel) },

  async tailscale() { return tailscaleInfo() },
  async setupFirewall() { return setupFirewall(requireServerDir()) },
  async friendKit() { return friendKitInfo(getSettings().mcVersion) },
  async buildFriendKit(refresh) {
    const s = getSettings()
    const ts = await tailscaleInfo()
    if (!ts.ip) throw new Error('Tailscale is not connected on this PC, so there is no address to give friends.')
    try {
      return await buildFriendKit({
        serverDir: requireServerDir(), serverName: s.serverName, mcVersion: s.mcVersion, dataVersion: DATA_VERSIONS[s.mcVersion] ?? 0, host: ts.ip, refresh,
        onProgress: (label) => emit({ type: 'progress', progress: { task: 'friendkit', label, done: 0, total: 0 } })
      })
    } finally { emit({ type: 'progress', progress: { task: 'friendkit', label: 'Done', done: 1, total: 1, finished: true } }) }
  }
}
