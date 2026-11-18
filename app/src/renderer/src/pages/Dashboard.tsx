import { useEffect, useRef, useState } from 'react'
import { Archive, Copy, Globe2, RotateCcw, SquareTerminal, Users } from 'lucide-react'
import type { PageProps } from '@/App'
import { api } from '@/lib/api'
import { fmtDuration, useLoad, useStore } from '@/lib/store'
import { ActionButton, Avatar, Banner, Beacon, Button, Empty, Panel, Stat, stateLabel } from '@/components/ui'

export function Dashboard({ go }: PageProps) {
  const { settings, stats, logs, act } = useStore()
  const ts = useLoad(() => api.tailscale())
  const info = useLoad(() => api.serverInfo(), [stats.state])
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])
  const tail = useRef<HTMLDivElement>(null)
  useEffect(() => { tail.current?.scrollTo({ top: tail.current.scrollHeight }) }, [logs.length])

  const address = ts.data?.ip ?? null
  const port = info.data?.port ?? 25565
  const addrText = address ? (port === 25565 ? address : `${address}:${port}`) : null
  // Prefer real heap use out of the allocated heap; fall back to the process size if jcmd isn't available.
  const heap = stats.heapUsedMB != null && stats.heapMaxMB
  const memGB = heap ? (stats.heapUsedMB! / 1024).toFixed(1) : stats.memoryMB != null ? (stats.memoryMB / 1024).toFixed(1) : '–'
  const memUnit = heap ? `/ ${Math.round(stats.heapMaxMB! / 1024)} GB` : stats.memoryMB != null ? 'GB (process)' : undefined
  const running = stats.state === 'online'

  return (
    <>
      {stats.state === 'external' && <Banner tone="warn">The server is already running in another window (for example start.bat). Type <code>stop</code> there, then start it from here so NexusHost can manage it.</Banner>}
      {stats.state === 'crashed' && <Banner tone="error" action={<Button size="sm" onClick={() => go('console')}>Open console</Button>}>The server stopped unexpectedly (exit code {stats.lastExitCode}).{settings?.autoRestart ? ' NexusHost will try to restart it.' : ''}</Banner>}
      {ts.data && !ts.data.loggedIn && <Banner tone="warn" action={<Button size="sm" onClick={() => go('friends')}>Fix</Button>}>Tailscale is not connected, so friends cannot reach the server.</Banner>}

      <section className="panel">
        <div className="hero">
          <Beacon state={stats.state} />
          <div className="hero__body">
            <div className="overline">{stateLabel(stats.state)}{stats.startedAt && running ? ` · up ${fmtDuration(Date.now() - stats.startedAt)}` : ''}</div>
            <h2 className="hero__name truncate">{settings?.serverName}</h2>
            <div className="cluster">
              {addrText
                ? <span className="address"><span className="truncate">{addrText}</span><Button size="sm" variant="ghost" icon={Copy} label="Copy address" onClick={() => act(() => api.copyText(addrText), 'Address copied')} /></span>
                : <span className="small muted">No Tailscale address yet</span>}
              <span className="tag">Paper {info.data?.mcVersion ?? settings?.mcVersion}</span>
              {info.data && !info.data.onlineMode && <span className="tag tag--warn">Offline mode</span>}
            </div>
          </div>
          <div className="cluster">
            <ActionButton icon={RotateCcw} disabled={!running} onAction={() => act(() => api.restart())}>Restart</ActionButton>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="cluster cluster--lg" style={{ justifyContent: 'space-between' }}>
          <Stat label="Players" value={stats.players.length} unit={`/ ${stats.maxPlayers}`} />
          <Stat label="TPS" value={stats.tps != null ? stats.tps.toFixed(1) : '–'} meter={stats.tps != null ? stats.tps / 20 : null} />
          <Stat label="CPU" value={stats.cpu ?? '–'} unit={stats.cpu != null ? '%' : undefined} meter={stats.cpu != null ? stats.cpu / 100 : null} />
          <Stat label="Memory" value={memGB} unit={memUnit} meter={heap ? stats.heapUsedMB! / stats.heapMaxMB! : null} />
        </div>
      </section>

      <div className="grid--2">
        <Panel title="Online now" actions={<Button size="sm" variant="ghost" icon={Users} onClick={() => go('players')}>Manage</Button>} tight>
          {stats.players.length ? (
            <div className="rows">
              {stats.players.map((p) => (
                <div className="row" key={p}><Avatar name={p} /><div className="row__title truncate">{p}</div>
                  <div className="row__actions"><ActionButton size="sm" variant="ghost" onAction={() => act(() => api.playerAction('kick', p), `Kicked ${p}`)}>Kick</ActionButton></div></div>
              ))}
            </div>
          ) : <Empty icon={Users} title={running ? 'Nobody online' : 'Server is offline'}><span className="small">{running ? 'Players show up here when they join.' : 'Start the server to let friends in.'}</span></Empty>}
        </Panel>
        <Panel title="Console" actions={<Button size="sm" variant="ghost" icon={SquareTerminal} onClick={() => go('console')}>Open</Button>}>
          <div className="mini-console" ref={tail} aria-label="Latest console lines">
            {logs.slice(-60).map((l) => <div key={l.id} className={`console__line--${l.level}`}>{l.text}</div>)}
            {!logs.length && <span className="faint">No output yet.</span>}
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel title="Backups" sub={settings?.backups.daily ? `Daily backups on, keeping ${settings.backups.keep}` : 'Daily backups off'} actions={<Button size="sm" variant="ghost" icon={Archive} onClick={() => go('backups')}>Open</Button>}>
          <ActionButton onAction={() => act(() => api.createBackup(), 'Backup saved')}>Back up now</ActionButton>
        </Panel>
        <Panel title="Friends" sub="Tailscale share invites and the one-click mod installer" actions={<Button size="sm" variant="ghost" icon={Globe2} onClick={() => go('friends')}>Open</Button>}>
          <span className="small muted">{ts.data?.firewallReady ? 'Firewall allows Tailscale only.' : 'Firewall not set up yet.'}</span>
        </Panel>
      </div>
    </>
  )
}
