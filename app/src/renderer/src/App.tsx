import { useEffect, useState, type ComponentType } from 'react'
import {
  Archive, Boxes, Cpu, FolderTree, Gauge, Globe2, Play, Puzzle, ScrollText, Settings as SettingsIcon, SlidersHorizontal, Square, SquareTerminal, Users
} from 'lucide-react'
import { useStore } from './lib/store'
import { api } from './lib/api'
import { ActionButton, DialogHost, StatusPill, Toasts } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { ConsolePage } from './pages/Console'
import { PlayersPage } from './pages/Players'
import { OptionsPage } from './pages/Options'
import { SoftwarePage } from './pages/Software'
import { PluginsPage } from './pages/Plugins'
import { WorldsPage } from './pages/Worlds'
import { BackupsPage } from './pages/Backups'
import { FriendsPage } from './pages/Friends'
import { FilesPage } from './pages/Files'
import { LogsPage } from './pages/Logs'
import { SettingsPage } from './pages/Settings'
import { SetupWizard } from './pages/Setup'
import { Showcase } from './pages/Showcase'
import { ServerSwitcher } from './components/ServerSwitcher'

export type PageId = 'dashboard' | 'console' | 'players' | 'options' | 'software' | 'plugins' | 'worlds' | 'backups' | 'friends' | 'files' | 'logs' | 'settings'
export interface PageProps { go: (p: PageId) => void; addServer: () => void }

const NAV: { group?: string; id: PageId; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; page: ComponentType<PageProps>; flush?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, page: Dashboard },
  { id: 'console', label: 'Console', icon: SquareTerminal, page: ConsolePage, flush: true },
  { id: 'players', label: 'Players', icon: Users, page: PlayersPage },
  { group: 'Server', id: 'options', label: 'Options', icon: SlidersHorizontal, page: OptionsPage },
  { id: 'software', label: 'Software', icon: Cpu, page: SoftwarePage },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, page: PluginsPage },
  { id: 'worlds', label: 'Worlds', icon: Boxes, page: WorldsPage },
  { id: 'backups', label: 'Backups', icon: Archive, page: BackupsPage },
  { group: 'Sharing', id: 'friends', label: 'Friends & access', icon: Globe2, page: FriendsPage },
  { group: 'Advanced', id: 'files', label: 'Files', icon: FolderTree, page: FilesPage, flush: true },
  { id: 'logs', label: 'Logs', icon: ScrollText, page: LogsPage, flush: true },
  { id: 'settings', label: 'App settings', icon: SettingsIcon, page: SettingsPage }
]

export function App() {
  const { settings, stats, act } = useStore()
  const [page, setPage] = useState<PageId>(() => (sessionStorage.getItem('page') as PageId) || 'dashboard')
  const [adding, setAdding] = useState(false)
  useEffect(() => { try { sessionStorage.setItem('page', page) } catch { /* private mode */ } }, [page])

  if (import.meta.env.DEV && new URLSearchParams(location.search).has('showcase')) return <><Showcase /><DialogHost /><Toasts /></>
  if (!settings) return null
  // a new server becomes the active one: reload so every page starts fresh for it
  const onSetupDone = () => { try { sessionStorage.setItem('page', 'dashboard') } catch { /* private mode */ } location.reload() }
  if (!settings.serverDir) return <><SetupWizard onDone={onSetupDone} /><DialogHost /><Toasts /></>
  if (adding) return <><SetupWizard onDone={onSetupDone} onCancel={() => setAdding(false)} /><DialogHost /><Toasts /></>

  const current = NAV.find((n) => n.id === page) ?? NAV[0]
  const Page = current.page
  const running = stats.state === 'online' || stats.state === 'starting'
  const busy = stats.state === 'starting' || stats.state === 'stopping'

  return (
    <div className="shell">
      <aside className="sidebar">
        <ServerSwitcher onAdd={() => setAdding(true)} />
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <div key={n.id} style={{ display: 'contents' }}>
              {n.group && <div className="nav__group overline">{n.group}</div>}
              <button className="nav__item" aria-current={page === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>
                <n.icon size={17} strokeWidth={page === n.id ? 2.25 : 1.75} />
                {n.label}
                {n.id === 'players' && stats.players.length > 0 && <span className="nav__count tabular">{stats.players.length}</span>}
              </button>
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1 className="topbar__title">{current.label}</h1>
          <div className="topbar__spacer" />
          <StatusPill state={stats.state} />
          {running || stats.state === 'stopping'
            ? <ActionButton variant="secondary" icon={Square} disabled={busy} onAction={() => act(() => api.stop())}>Stop</ActionButton>
            : <ActionButton variant="primary" icon={Play} disabled={stats.state === 'external'} onAction={() => act(() => api.start())}>Start</ActionButton>}
        </header>
        <div className={`page ${current.flush ? 'page--flush' : ''}`}>
          {current.flush ? <Page go={setPage} addServer={() => setAdding(true)} /> : <div className="page__inner" key={page}><Page go={setPage} addServer={() => setAdding(true)} /></div>}
        </div>
      </main>
      <DialogHost />
      <Toasts />
    </div>
  )
}
