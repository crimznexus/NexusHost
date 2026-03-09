// nexushost/dashboard/main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { GameProxy } from './GameProxy.js';

const proxy = new GameProxy();

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Nexus Client",
        backgroundColor: '#09090b', // Zinc-950
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // In production, we'd load the built index.html
    // In development, we can load from the dev server
    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL('http://localhost:5173');
    } else {
        win.loadFile(path.join(__dirname, 'dist/index.html'));
    }

    win.setMenuBarVisibility(false);
}

ipcMain.on('start-game-proxy', (event, hubUrl) => {
    proxy.start(hubUrl);
});

ipcMain.on('stop-game-proxy', () => {
    proxy.stop();
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
