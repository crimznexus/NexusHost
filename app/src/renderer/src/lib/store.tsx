import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppSettings, LogLine, ServerStats, TaskProgress } from '@shared/types'
import { api, onEvent } from './api'

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string }

interface Store {
  settings: AppSettings | null
  setSettings: (s: AppSettings) => void
  stats: ServerStats
  logs: LogLine[]
  progress: Record<string, TaskProgress>
  toasts: Toast[]
  toast: (kind: Toast['kind'], text: string) => void
  dismiss: (id: number) => void
  /** Runs an async action, shows errors as toasts, returns the result or undefined. */
  act: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>
}

const Ctx = createContext<Store | null>(null)
const EMPTY: ServerStats = { state: 'stopped', pid: null, startedAt: null, cpu: null, memoryMB: null, tps: null, players: [], maxPlayers: 20, lastExitCode: null, emptySince: null }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [stats, setStats] = useState<ServerStats>(EMPTY)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState<Record<string, TaskProgress>>({})
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const nextToast = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextToast.current++
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500)
  }, [dismiss])
  const act = useCallback(async <T,>(fn: () => Promise<T>, success?: string) => {
    try { const r = await fn(); if (success) toast('success', success); return r } catch (e: any) { toast('error', e?.message ?? String(e)); return undefined }
  }, [toast])

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setLoadError(e?.message ?? String(e)))
    api.getStats().then(setStats)
    api.getLogs().then(setLogs)
    const off = onEvent((e) => {
      if (e.type === 'stats') setStats(e.stats)
      else if (e.type === 'log') setLogs((l) => { const n = l.concat(e.lines); return n.length > 3000 ? n.slice(-3000) : n })
      else if (e.type === 'progress') setProgress((p) => ({ ...p, [e.progress.task]: e.progress }))
      else if (e.type === 'toast') toast(e.kind, e.text)
    })
    const poll = setInterval(() => api.getStats().then(setStats).catch(() => {}), 10000)
    return () => { off(); clearInterval(poll) }
  }, [toast])

  const value = useMemo(() => ({ settings, setSettings, stats, logs, progress, toasts, toast, dismiss, act }), [settings, stats, logs, progress, toasts, toast, dismiss, act])
  if (loadError) return <div className="empty" role="alert" style={{ height: '100dvh', justifyContent: 'center' }}><strong>NexusHost could not start</strong><span className="small mono wrap-any">{loadError}</span></div>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

/** Loads data with api, reloading when deps change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    setLoading(true)
    return fn().then((d) => { setData(d); setError(null) }).catch((e) => setError(e?.message ?? String(e))).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload, setData }
}

export const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`
export const fmtAgo = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export const fmtDuration = (ms: number) => {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}
