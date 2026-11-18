import { useState } from 'react'
import { ArrowUpCircle, Cpu } from 'lucide-react'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Field, Panel, Progress, confirmDialog } from '@/components/ui'

const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d } return 0 }

export function SoftwarePage() {
  const { stats, progress, act, setSettings } = useStore()
  const info = useLoad(() => api.serverInfo())
  const versions = useLoad(() => api.paperVersions())
  const [pick, setPick] = useState<string>('')
  const version = pick || info.data?.mcVersion || ''
  const builds = useLoad(() => version ? api.paperBuilds(version) : Promise.resolve([]), [version])
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const latest = builds.data?.find((b) => b.channel === 'STABLE') ?? builds.data?.[0]
  const isCurrent = version === info.data?.mcVersion
  const upToDate = isCurrent && latest && latest.id === info.data?.paperBuild
  const p = progress.paper
  const busy = p && !p.finished

  const install = async () => {
    if (!isCurrent) {
      const ok = await confirmDialog({
        title: `Switch to Minecraft ${version}?`,
        body: `${cmp(version, info.data?.mcVersion ?? '0') > 0 ? 'Worlds upgrade to the new version and cannot go back.' : 'Going to an older version can break the world.'} NexusHost backs up the world first. Friends need the same version, so rebuild the mod installer afterwards.`,
        confirm: 'Switch version', danger: cmp(version, info.data?.mcVersion ?? '0') < 0
      })
      if (!ok) return
    }
    const r = await act(() => api.updatePaper(version), `Paper ${version} build installed`)
    if (r) { info.reload(); setSettings(await api.getSettings()) }
  }

  return (
    <>
      <Panel title="Paper" sub="A fast, plugin-friendly Minecraft server. NexusHost installs the newest stable build.">
        <div className="cluster cluster--lg" style={{ alignItems: 'flex-end' }}>
          <div className="stat"><span className="overline">Installed</span><span className="stat__value">{info.data?.mcVersion ?? '–'} <small>build {info.data?.paperBuild ?? '–'}</small></span></div>
          <div style={{ width: 220 }}>
            <Field label="Minecraft version">
              <select className="select" value={version} onChange={(e) => setPick(e.target.value)}>
                {(versions.data?.versions ?? (version ? [version] : [])).map((v) => <option key={v} value={v}>{v}{v === versions.data?.latest ? ' (latest)' : ''}</option>)}
              </select>
            </Field>
          </div>
          <ActionButton variant="primary" icon={ArrowUpCircle} disabled={running || !latest || !!upToDate || !!busy}
            onAction={install}>{upToDate ? 'Up to date' : isCurrent ? `Update to build ${latest?.id ?? ''}` : `Install ${version}`}</ActionButton>
        </div>
        {running && <div style={{ marginTop: 12 }}><Banner tone="warn">Stop the server to change its software.</Banner></div>}
        {busy && <div className="stack" style={{ marginTop: 12 }}><span className="small muted">{p.label}</span><Progress value={p.total ? p.done / p.total : null} /></div>}
      </Panel>
      <Panel title={`Recent builds for ${version || '…'}`} tight>
        <div className="rows">
          {(builds.data ?? []).map((b) => (
            <div className="row" key={b.id}><span className="avatar"><Cpu size={16} /></span>
              <div><div className="row__title">Build {b.id}</div><div className="row__meta">{new Date(b.time).toLocaleString()}</div></div>
              <div className="row__actions">{b.channel !== 'STABLE' && <span className="tag tag--warn">{b.channel.toLowerCase()}</span>}{isCurrent && b.id === info.data?.paperBuild && <span className="tag tag--accent">installed</span>}</div>
            </div>
          ))}
        </div>
        {builds.error && <div style={{ padding: 16 }}><Banner tone="error">{builds.error}</Banner></div>}
      </Panel>
    </>
  )
}
