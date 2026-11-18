import type { NexusApi, NexusEvent } from '@shared/types'

interface Bridge { invoke(method: string, ...args: unknown[]): Promise<any>; on(cb: (e: NexusEvent) => void): () => void }
declare global { interface Window { nexus?: Bridge } }

let bridge: Bridge | undefined = window.nexus
if (!bridge && import.meta.env.DEV) {
  // Plain-browser preview (vite dev server without Electron): fake data for visual QA.
  bridge = (await import('./mock')).mockBridge
}
if (!bridge) throw new Error('NexusHost must run inside its desktop app.')

export const api = new Proxy({} as NexusApi, {
  get: (_t, method: string) => (...args: unknown[]) => bridge!.invoke(method, ...args)
})

export const onEvent = (cb: (e: NexusEvent) => void) => bridge!.on(cb)
export const isMock = !window.nexus
