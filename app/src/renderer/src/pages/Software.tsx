import { useState } from 'react'
import { ArrowUpCircle, Cpu } from 'lucide-react'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { LOADER_LABEL } from '@/lib/loaders'
import { ActionButton, Banner, Field, Panel, Progress, confirmDialog } from '@/components/ui'

const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d } return 0 }

const ABOUT: Record<string, string> = {
  paper: 'A fast, plugin-friendly Minecraft server. NexusHost installs the newest stable build.',
  fabric: 'A lightweight mod loader. NexusHost installs the newest stable Fabric loader for your Minecraft version.',
  neoforge: 'The mod loader most current modpacks use. NexusHost installs the newest stable NeoForge for your Minecraft version.',
  forge: 'The classic mod loader. NexusHost installs the recommended Forge build for your Minecraft version.',
  vanilla: "Mojang's own server software, without plugins or mods."
}

export function SoftwarePage() {
  const { stats, settings, progress, act, setSettings, toast } = useStore()
  const loader = settings?.loader ?? 'paper'
  const name = LOADER_LABEL[loader]
  const info = useLoad(() => api.serverInfo())
  const versions = useLoad(() => api.mcVersions(loader), [loader])
  const [pick, setPick] = useState<string>('')
  const version = pick || info.data?.mcVersion || settings?.mcVersion || ''
  const sw = useLoad(() => (version ? api.software(version) : Promise.resolve(null)), [version])
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const latest = sw.data?.latest ?? null
  const installed = info.data?.loaderVersion ?? null
  const isCurrent = version === info.data?.mcVersion
  const upToDate = isCurrent && !!latest && latest === installed
  const p = progress.paper
  const busy = p && !p.finished
  const unit = loader === 'paper' ? 'build' : loader === 'vanilla' ? 'version' : `${name}`

  const install = async () => {
    if (!isCurrent) {
      const ok = await confirmDialog({
        title: `Switch to Minecraft ${version}?`,
        body: `${cmp(version, info.data?.mcVersion ?? '0') > 0 ? 'Worlds upgrade to the new version and cannot go back.' : 'Going to an older version can break the world.'} NexusHost backs up the world first. ${loader === 'paper' || loader === 'vanilla' ? '' : 'Your mods need versions for the new Minecraft too, so check the Mods page afterwards. '}Friends need the same version, so rebuild their installer afterwards.`,
        confirm: 'Switch version', danger: cmp(version, info.data?.mcVersion ?? '0') < 0
      })
      if (!ok) return
    }
    const r = await act(() => api.installSoftware(version))
    if (r) { toast('success', `${r} installed`); info.reload(); sw.reload(); setSettings(await api.getSettings()) }
  }

  return (
    <>
      <Panel title={name} sub={ABOUT[loader]}>
        <div className="cluster cluster--lg" style={{ alignItems: 'flex-end' }}>
          <div className="stat"><span className="overline">Installed</span><span className="stat__value">{info.data?.mcVersion ?? '–'} {loader !== 'vanilla' && <small>{loader === 'paper' ? 'build' : name} {installed ?? '–'}</small>}</span></div>
          <div style={{ width: 220 }}>
            <Field label="Minecraft version">
              <select className="select" value={version} onChange={(e) => setPick(e.target.value)}>
                {(versions.data?.versions ?? (version ? [version] : [])).slice(0, 40).map((v) => <option key={v} value={v}>{v}{v === versions.data?.latest ? ' (latest)' : ''}</option>)}
              </select>
            </Field>
          </div>
          <ActionButton variant="primary" icon={ArrowUpCircle} disabled={running || !latest || upToDate || !!busy}
            onAction={install}>{upToDate ? 'Up to date' : isCurrent ? `Update to ${unit} ${latest ?? ''}` : `Install ${version}`}</ActionButton>
        </div>
        {sw.data && !latest && <div style={{ marginTop: 12 }}><Banner tone="warn">{name} has no version for Minecraft {version} yet.</Banner></div>}
        {running && <div style={{ marginTop: 12 }}><Banner tone="warn">Stop the server to change its software.</Banner></div>}
        {busy && <div className="stack" style={{ marginTop: 12 }}><span className="small muted">{p.label}</span><Progress value={p.total ? p.done / p.total : null} /></div>}
        {versions.error && <div style={{ marginTop: 12 }}><Banner tone="error">Could not get the {name} versions: {versions.error}</Banner></div>}
      </Panel>
      {loader !== 'vanilla' && (
        <Panel title={`${loader === 'paper' ? 'Recent builds' : `${name} versions`} for ${version || '…'}`} tight>
          <div className="rows">
            {(sw.data?.builds ?? []).map((b) => (
              <div className="row" key={b.id}><span className="avatar"><Cpu size={16} /></span>
                <div><div className="row__title">{loader === 'paper' ? `Build ${b.id}` : `${name} ${b.id}`}</div>{b.time && <div className="row__meta">{new Date(b.time).toLocaleString()}</div>}</div>
                <div className="row__actions">{b.channel !== 'STABLE' && <span className={`tag ${b.channel === 'RECOMMENDED' ? 'tag--accent' : 'tag--warn'}`}>{b.channel.toLowerCase()}</span>}{isCurrent && b.id === installed && <span className="tag tag--accent">installed</span>}</div>
              </div>
            ))}
          </div>
          {sw.error && <div style={{ padding: 16 }}><Banner tone="error">{sw.error}</Banner></div>}
        </Panel>
      )}
    </>
  )
}
