import { useEffect, useState } from 'react'
import { ArrowUpCircle, Download, Puzzle, Search, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import type { ModrinthHit } from '@shared/types'
import { ActionButton, Banner, Button, Empty, Panel, Seg, Switch, confirmDialog } from '@/components/ui'

export function PluginsPage() {
  const { stats, settings, act } = useStore()
  const [tab, setTab] = useState<'installed' | 'browse'>('installed')
  const list = useLoad(() => api.plugins())
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const updates = (list.data ?? []).filter((p) => p.updateFile)

  return (
    <>
      <div className="spread">
        <Seg value={tab} onChange={setTab} options={[{ value: 'installed', label: `Installed${list.data ? ` (${list.data.length})` : ''}` }, { value: 'browse', label: 'Browse Modrinth' }]} />
        {tab === 'installed' && updates.length > 0 && (
          <ActionButton variant="primary" icon={ArrowUpCircle} disabled={running} onAction={async () => {
            for (const u of updates) await act(() => api.updatePlugin(u.file))
            list.reload()
          }}>Update all ({updates.length})</ActionButton>
        )}
      </div>
      {running && <Banner tone="warn">Plugins load when the server starts. Stop it to update, turn off or remove plugins; new installs apply on the next start.</Banner>}

      {tab === 'installed' ? (
        <Panel tight>
          {list.loading && !list.data && <div className="empty"><span className="small muted">Checking plugins and updates…</span></div>}
          {list.data && !list.data.length && <Empty icon={Puzzle} title="No plugins installed"><Button onClick={() => setTab('browse')}>Browse Modrinth</Button></Empty>}
          <div className="rows">
            {(list.data ?? []).map((p) => (
              <div className="row" key={p.file} style={{ opacity: p.enabled ? 1 : 0.65 }}>
                <span className="avatar"><Puzzle size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="cluster" style={{ flexWrap: 'nowrap' }}><span className="row__title truncate">{p.name}</span><span className="tag">{p.version || '?'}</span>{p.updateFile && <span className="tag tag--accent">update {p.latestVersion}</span>}{!p.enabled && <span className="tag">off</span>}</div>
                  <div className="row__meta truncate">{p.description || p.file}</div>
                </div>
                <div className="row__actions">
                  {p.updateFile && <ActionButton size="sm" icon={ArrowUpCircle} disabled={running} onAction={async () => { await act(() => api.updatePlugin(p.file), `${p.name} updated`); list.reload() }}>Update</ActionButton>}
                  <Switch checked={p.enabled} disabled={running} label={`${p.name} on`} onChange={async (v) => { await act(() => api.setPluginEnabled(p.file, v)); list.reload() }} />
                  <Button size="sm" variant="ghost" icon={Trash2} label="Remove" disabled={running} onClick={async () => {
                    if (await confirmDialog({ title: `Remove ${p.name}?`, body: 'The jar moves to plugins-old. Its settings folder stays, so reinstalling keeps them.', confirm: 'Remove', danger: true })) { await act(() => api.removePlugin(p.file), `${p.name} removed`); list.reload() }
                  }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : <Browse mcVersion={settings?.mcVersion ?? ''} installed={(list.data ?? []).map((p) => p.slug).filter(Boolean) as string[]} onInstalled={() => list.reload()} />}
    </>
  )
}

function Browse({ mcVersion, installed, onInstalled }: { mcVersion: string; installed: string[]; onInstalled: () => void }) {
  const { act } = useStore()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModrinthHit[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setHits(null); api.searchPlugins(query).then((h) => { setHits(h); setErr(null) }).catch((e) => setErr(e.message)) }, [query])
  return (
    <>
      <form className="input-group" onSubmit={(e) => { e.preventDefault(); setQuery(q) }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search plugins for Minecraft ${mcVersion}`} aria-label="Search plugins" />
        <Button variant="primary" icon={Search} type="submit">Search</Button>
      </form>
      {err && <Banner tone="error">{err}</Banner>}
      {!hits && !err && <div className="empty"><span className="small muted">Searching Modrinth…</span></div>}
      {hits && !hits.length && <Empty icon={Search} title="No plugins found">Only plugins with a version for {mcVersion} are shown.</Empty>}
      <div className="grid">
        {(hits ?? []).map((h) => (
          <div className="card" key={h.slug}>
            <span className="card__icon">{h.icon_url ? <img src={h.icon_url} alt="" loading="lazy" /> : <Puzzle size={20} />}</span>
            <div style={{ minWidth: 0 }}>
              <div className="row__title truncate">{h.title}</div>
              <div className="caption muted truncate">by {h.author} · {Intl.NumberFormat(undefined, { notation: 'compact' }).format(h.downloads)} downloads</div>
              <div className="small muted clamp-2" style={{ marginTop: 6 }}>{h.description}</div>
            </div>
            <div className="card__foot">
              <a className="small" href={`https://modrinth.com/plugin/${h.slug}`} target="_blank" rel="noreferrer">Details</a>
              {installed.includes(h.slug)
                ? <span className="tag tag--accent">installed</span>
                : <ActionButton size="sm" variant="primary" icon={Download} onAction={async () => { await act(() => api.installPlugin(h.slug), `${h.title} installed. Restart the server to load it.`); onInstalled() }}>Install</ActionButton>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
