import { contextBridge, ipcRenderer } from 'electron'
import type { NexusEvent } from '@shared/types'

contextBridge.exposeInMainWorld('nexus', {
  invoke: async (method: string, ...args: unknown[]) => {
    try { return await ipcRenderer.invoke('nexus:invoke', method, args) }
    catch (e: any) { throw new Error(String(e?.message ?? e).replace(/^Error invoking remote method 'nexus:invoke': (Error: )?/, '')) }
  },
  on: (cb: (e: NexusEvent) => void) => {
    const h = (_: unknown, e: NexusEvent) => cb(e)
    ipcRenderer.on('nexus:event', h)
    return () => ipcRenderer.removeListener('nexus:event', h)
  }
})
