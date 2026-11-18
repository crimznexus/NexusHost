import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { api, emit } from './api'
import { getSettings, saveSettings } from './settings'
import { server } from './server'
import { appIcon } from './setup'
import { createBackup, pruneAutoBackups } from './worlds'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showWindow())

function showWindow() {
  if (!mainWindow) return createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show(); mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 640, show: false,
    title: 'NexusHost', icon: appIcon(), autoHideMenuBar: true, backgroundColor: '#0e1012',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, nodeIntegration: false }
  })
  mainWindow.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) mainWindow?.show() })
  mainWindow.on('close', (e) => {
    if (!quitting && getSettings().closeToTray) { e.preventDefault(); mainWindow?.hide() }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' } })
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault() })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

const stateLabel: Record<string, string> = { stopped: 'Stopped', starting: 'Starting...', online: 'Online', stopping: 'Stopping...', crashed: 'Crashed', external: 'Running outside NexusHost' }

function updateTray() {
  if (!tray) return
  const st = server.stats
  const running = server.running
  tray.setToolTip(`NexusHost: ${stateLabel[st.state]}${st.state === 'online' ? ` (${st.players.length} online)` : ''}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${getSettings().serverName}: ${stateLabel[st.state]}`, enabled: false },
    { type: 'separator' },
    { label: 'Open NexusHost', click: showWindow },
    { label: 'Start server', enabled: !running && st.state !== 'external' && !!getSettings().serverDir, click: () => server.start().catch((e) => emit({ type: 'toast', kind: 'error', text: e.message })) },
    { label: 'Stop server', enabled: running && st.state !== 'stopping', click: () => server.stop() },
    { type: 'separator' },
    { label: 'Quit', click: () => quit() }
  ]))
}

async function quit() {
  if (server.running) {
    showWindow()
    const r = await dialog.showMessageBox(mainWindow!, {
      type: 'question', buttons: ['Stop server and quit', 'Cancel'], defaultId: 0, cancelId: 1,
      title: 'Quit NexusHost', message: 'The Minecraft server is running.', detail: 'Quitting stops it safely first. Players online will be disconnected.'
    })
    if (r.response !== 0) return
    await server.stop()
  }
  quitting = true
  app.quit()
}

async function dailyBackup() {
  const s = getSettings()
  if (!s.serverDir || !s.backups.daily) return
  const last = s.backups.lastRun ? Date.parse(s.backups.lastRun) : 0
  if (Date.now() - last < 23.5 * 3600 * 1000) return
  try {
    await createBackup(s.serverDir, server, true)
    await pruneAutoBackups(s.serverDir, s.backups.keep)
    saveSettings({ backups: { ...s.backups, lastRun: new Date().toISOString() } })
    emit({ type: 'toast', kind: 'success', text: 'Daily backup saved.' })
  } catch (e: any) {
    if (!/no world/i.test(e.message)) emit({ type: 'toast', kind: 'error', text: `Daily backup failed: ${e.message}` })
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('io.github.crimznexus.nexushost')
  Menu.setApplicationMenu(null)
  ipcMain.handle('nexus:invoke', async (_e, method: string, args: unknown[]) => {
    const fn = (api as any)[method]
    if (typeof fn !== 'function') throw new Error(`Unknown method ${method}`)
    return fn(...args)
  })
  server.on('log', (lines) => emit({ type: 'log', lines }))
  server.on('stats', (stats) => { emit({ type: 'stats', stats }); updateTray() })

  const icon = appIcon()
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }))
  tray.on('double-click', showWindow)
  updateTray()
  createWindow()

  setInterval(() => server.detectExternal().catch(() => {}), 10000)
  setInterval(dailyBackup, 30 * 60 * 1000)
  setTimeout(dailyBackup, 2 * 60 * 1000)
  const s = getSettings()
  if (s.autoStartServer && s.serverDir) setTimeout(() => server.start().catch((e) => server.system(`Auto-start failed: ${e.message}`)), 3000)
})

app.on('before-quit', (e) => { if (!quitting && server.running) { e.preventDefault(); quit() } else quitting = true })
app.on('window-all-closed', () => { /* stays in the tray */ })
