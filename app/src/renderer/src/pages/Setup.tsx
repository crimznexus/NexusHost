import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Blocks, Box, Check, Coffee, FolderOpen, FolderPlus, Hammer, Puzzle, Rocket, Wrench } from 'lucide-react'
import type { JavaInfo, Loader, ServerInfo, SetupOptions } from '@shared/types'
import { LOADER_INFO, LOADER_LABEL, addonWord } from '@/lib/loaders'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Beacon, Button, Field, Progress, ToggleRow } from '@/components/ui'

// recommended add-ons, and the server types they exist for on Modrinth
const PLUGINS: { slug: string; title: string; hint: string; on: Loader[] }[] = [
  { slug: 'bluemap', title: 'BlueMap', hint: 'Live 3D map of the world in a web browser', on: ['paper', 'fabric', 'neoforge', 'forge'] },
  { slug: 'simple-voice-chat', title: 'Simple Voice Chat', hint: 'Proximity voice chat (players need the mod too)', on: ['paper', 'fabric', 'neoforge', 'forge'] },
  { slug: 'axgraves', title: 'AxGraves', hint: 'Your items go into a grave when you die', on: ['paper'] },
  { slug: 'chunky', title: 'Chunky', hint: 'Pre-generates the map so exploring lags less', on: ['paper', 'fabric', 'neoforge', 'forge'] }
]

const LOADER_ICON = { paper: Puzzle, fabric: Blocks, neoforge: Hammer, forge: Wrench, vanilla: Box }

type Step = 'mode' | 'software' | 'basics' | 'java' | 'options' | 'install'

export function SetupWizard({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const { setSettings, progress, toast } = useStore()
  const sys = useLoad(() => api.systemInfo())
  const [step, setStep] = useState<Step>('mode')
  const [o, setO] = useState<SetupOptions>({ mode: 'new', loader: 'paper', dir: '', serverName: 'Friends Server', mcVersion: '', memoryGB: 4, offlineMode: false, plugins: PLUGINS.map((p) => p.slug), acceptEula: false, motd: '', maxPlayers: 12 })
  const [folder, setFolder] = useState<ServerInfo | null>(null)
  const [java, setJava] = useState<JavaInfo | null | undefined>(undefined)
  const [javaMin, setJavaMin] = useState(21)
  const [installing, setInstalling] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [worldMsg, setWorldMsg] = useState<string | null>(null)
  const set = (p: Partial<SetupOptions>) => setO((x) => ({ ...x, ...p }))
  const versions = useLoad(() => api.mcVersions(o.loader), [o.loader])
  const word = addonWord(o.loader)
  const plugins = PLUGINS.filter((p) => p.on.includes(o.loader))

  // a server type that doesn't offer the chosen version falls back to its newest one
  useEffect(() => { if (versions.data && (!o.mcVersion || !versions.data.versions.includes(o.mcVersion)) && !(o.mode === 'existing' && folder?.mcVersion)) set({ mcVersion: versions.data.latest }) }, [versions.data])
  useEffect(() => { if (sys.data) set({ memoryGB: Math.min(8, Math.max(2, Math.floor(sys.data.totalMemGB / 2))) }) }, [sys.data])
  useEffect(() => {
    if (step !== 'java' || !o.mcVersion) return
    setJava(undefined)
    api.javaMinimum(o.mcVersion, o.loader).then(async (m) => { setJavaMin(m); setJava(await api.findJava(m)) }).catch(() => setJava(null))
  }, [step, o.mcVersion, o.loader])

  const pickFolder = async () => {
    const d = await api.pickFolder(o.mode === 'new' ? 'Pick an empty folder for the new server' : 'Pick your existing server folder')
    if (!d) return
    const info = await api.inspectFolder(d)
    setFolder(info); set({ dir: d, ...(info.mcVersion ? { mcVersion: info.mcVersion } : {}), ...(info.eulaAccepted ? { acceptEula: true } : {}), ...(o.mode === 'existing' && info.loader ? { loader: info.loader } : {}) })
  }

  const order: Step[] = o.mode === 'new' ? ['mode', 'software', 'basics', 'java', 'options', 'install'] : ['mode', 'basics', 'java', 'options', 'install']
  const idx = order.indexOf(step)
  const p = progress.setup
  const folderProblem = o.mode === 'existing' && folder && !folder.jar ? 'No server software found here. NexusHost will install Paper.' : o.mode === 'new' && folder?.hasWorld ? 'This folder already has a world. Pick "Use my existing server" instead to keep it.' : null
  const canNext = step === 'mode' || step === 'software' ? true : step === 'basics' ? !!o.dir && !!o.serverName.trim() && !!o.mcVersion : step === 'java' ? !!java : step === 'options' ? o.acceptEula : false

  const install = async () => {
    setStep('install'); setInstalling(true); setFailed(null)
    try { await api.runSetup(o); toast('success', 'Your server is ready'); if (onDone) onDone(); else setSettings(await api.getSettings()) }
    catch (e: any) { setFailed(e.message) } finally { setInstalling(false) }
  }

  return (
    <div className="wizard">
      <div className="wizard__card">
        <div className="wizard__head">
          <Beacon state={installing ? 'starting' : 'stopped'} />
          <div><div className="overline">NexusHost setup</div><h1 className="hero__name" style={{ fontSize: 24 }}>{
            { mode: onCancel ? 'Add a server' : 'Host a Minecraft server', software: 'Server type', basics: 'Name and version', java: 'Java', options: 'World and options', install: 'Setting up your server' }[step]}</h1></div>
        </div>
        <div className="wizard__steps" aria-hidden>{order.map((s, i) => <span key={s} className={`wizard__step ${i <= idx ? 'wizard__step--done' : ''}`} />)}</div>

        <div className="wizard__body">
          {step === 'mode' && <>
            <p className="muted" style={{ margin: 0 }}>Run a Minecraft server on this PC for you and your friends. They connect through Tailscale, so it works even behind CGNAT.</p>
            {(['new', 'existing'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={o.mode === m} className="choice" onClick={() => { set({ mode: m }); setFolder(null); set({ dir: '' }) }}>
                {m === 'new' ? <FolderPlus size={20} /> : <FolderOpen size={20} />}
                <div><div className="row__title">{m === 'new' ? 'Create a new server' : 'Use my existing server'}</div><div className="small muted">{m === 'new' ? 'Installs Paper, Fabric, NeoForge, Forge or Vanilla into an empty folder.' : 'Pick a folder that already has a server (for example one started with start.bat). Worlds and settings stay as they are.'}</div></div>
                <span className="choice__check"><Check size={13} strokeWidth={3} /></span>
              </button>
            ))}
          </>}

          {step === 'software' && <>
            <p className="muted" style={{ margin: 0 }}>Plugins add features without players installing anything. Mods can add new content, but every player needs the same mods. You can't switch type later.</p>
            {LOADER_INFO.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={o.loader === l.id} className="choice" onClick={() => set({ loader: l.id, plugins: PLUGINS.filter((p) => p.on.includes(l.id)).map((p) => p.slug) })}>
                {(() => { const I = LOADER_ICON[l.id]; return <I size={20} /> })()}
                <div><div className="row__title">{l.title}{l.id === 'paper' && <span className="tag tag--accent" style={{ marginLeft: 8 }}>recommended</span>}</div><div className="small muted">{l.hint}</div></div>
                <span className="choice__check"><Check size={13} strokeWidth={3} /></span>
              </button>
            ))}
          </>}

          {step === 'basics' && <>
            <Field label="Server folder" hint={folderProblem ?? (folder ? (folder.jar ? `Found ${folder.loader ? LOADER_LABEL[folder.loader] + ' ' : ''}${folder.mcVersion ?? ''}${folder.hasWorld ? ' and a world' : ''}.` : 'Empty folder, good.') : undefined)} error={o.mode === 'new' && folder?.hasWorld ? folderProblem : null}>
              <div className="input-group"><input className="input mono" readOnly value={o.dir} placeholder="Pick a folder" /><Button icon={FolderOpen} onClick={pickFolder}>Browse</Button></div>
            </Field>
            <Field label="Server name"><input className="input" value={o.serverName} maxLength={40} onChange={(e) => set({ serverName: e.target.value.replace(/['"|%`]/g, '') })} /></Field>
            <div className="grid">
              <Field label={`Minecraft version (${LOADER_LABEL[o.loader]})`} hint={o.mode === 'existing' && folder?.mcVersion ? 'Detected from your server' : 'Friends must use the same version'}>
                <select className="select" value={o.mcVersion} disabled={o.mode === 'existing' && !!folder?.mcVersion} onChange={(e) => set({ mcVersion: e.target.value })}>
                  {(versions.data?.versions ?? (o.mcVersion ? [o.mcVersion] : [])).slice(0, 20).map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label={`Memory: ${o.memoryGB} GB`} hint={`This PC has ${sys.data?.totalMemGB ?? '?'} GB. 4-8 GB suits 6-10 players.`}>
                <input className="range" type="range" min={2} max={Math.max(2, (sys.data?.totalMemGB ?? 8) - 2)} value={o.memoryGB} onChange={(e) => set({ memoryGB: Number(e.target.value) })} />
              </Field>
            </div>
            {versions.error && <Banner tone="error">Could not get the {LOADER_LABEL[o.loader]} versions: {versions.error}</Banner>}
          </>}

          {step === 'java' && <>
            <p className="muted" style={{ margin: 0 }}>Minecraft {o.mcVersion} needs Java {javaMin} or newer.</p>
            {java === undefined && <Progress value={null} />}
            {java && <Banner tone="ok">Found Java {java.major}: <span className="mono wrap-any">{java.path}</span></Banner>}
            {java === null && <>
              <Banner tone="warn">Java {javaMin} was not found on this PC.</Banner>
              <div className="cluster">
                <ActionButton variant="primary" icon={Coffee} onAction={async () => { await api.installJava(javaMin); setJava(await api.findJava(javaMin)) }}>Install Java {javaMin}</ActionButton>
                <ActionButton onAction={async () => setJava(await api.findJava(javaMin))}>Check again</ActionButton>
              </div>
              <span className="small faint">The installer opens in a separate window and may ask for administrator permission.</span>
            </>}
          </>}

          {step === 'options' && <>
            {!(o.mode === 'existing' && folder?.hasWorld) && <div className="stack" style={{ gap: 6 }}>
              <div className="overline">World</div>
              <div className="cluster">
                <Button size="sm" onClick={async () => { const f = await api.pickFile('Pick a world zip', ['zip']); if (f) { const c = await api.checkWorld(f); setWorldMsg(c.message); set({ worldSource: c.ok ? f : null }) } }}>Use a world zip…</Button>
                <Button size="sm" onClick={async () => { const f = await api.pickFolder('Pick a world folder (it contains level.dat)'); if (f) { const c = await api.checkWorld(f); setWorldMsg(c.message); set({ worldSource: c.ok ? f : null }) } }}>Use a world folder…</Button>
                {o.worldSource && <Button size="sm" variant="ghost" onClick={() => { set({ worldSource: null }); setWorldMsg(null) }}>Generate a new world instead</Button>}
              </div>
              {worldMsg && <Banner tone={o.worldSource ? 'ok' : 'error'}>{worldMsg}</Banner>}
              {o.worldSource && <span className="field__hint">From a singleplayer world, the owner's inventory doesn't carry over (singleplayer keeps it inside the world file); everything they built stays. Worlds played on LAN or a server keep every player's inventory.</span>}
              {!o.worldSource && o.mode === 'new' && <Field label="Seed (optional)" hint="Leave empty for a random world"><input className="input" value={o.seed ?? ''} onChange={(e) => set({ seed: e.target.value })} /></Field>}
            </div>}
            <ToggleRow title="Allow TLauncher players (offline mode)" hint={`Players without a bought Minecraft account can join. Names are then case-sensitive. You can change this later in Options.${o.loader !== 'paper' ? ' NexusGuard (name protection) needs Paper, so only whitelist people you trust.' : ''}`} checked={o.offlineMode} onChange={(v) => set({ offlineMode: v })} disabled={o.mode === 'existing'} />
            {o.mode === 'new' && word && plugins.length > 0 && <div>
              <div className="overline" style={{ margin: '8px 0 4px' }}>{word === 'mod' ? 'Mods' : 'Plugins'}</div>
              {plugins.map((pl) => <ToggleRow key={pl.slug} title={pl.title} hint={pl.hint} checked={o.plugins.includes(pl.slug)} onChange={(v) => set({ plugins: v ? [...o.plugins, pl.slug] : o.plugins.filter((x) => x !== pl.slug) })} />)}
            </div>}
            <ToggleRow title="I accept the Minecraft EULA" hint={<>Required to run a server. Read it at <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">aka.ms/MinecraftEULA</a>.</>} checked={o.acceptEula} onChange={(v) => set({ acceptEula: v })} />
          </>}

          {step === 'install' && <>
            <Progress value={p ? (p.total ? p.done / p.total : null) : null} />
            <span className="small muted">{p?.label ?? 'Starting…'}</span>
            {failed && <Banner tone="error">{failed}</Banner>}
          </>}
        </div>

        <div className="wizard__foot">
          {idx === 0 && onCancel
            ? <Button variant="ghost" icon={ArrowLeft} onClick={onCancel}>Cancel</Button>
            : <Button variant="ghost" icon={ArrowLeft} disabled={idx === 0 || installing} onClick={() => setStep(order[Math.max(0, idx - 1)])}>Back</Button>}
          {step === 'options' ? <Button variant="primary" icon={Rocket} disabled={!canNext} onClick={install}>Set up server</Button>
            : step === 'install' ? (failed ? <Button variant="primary" onClick={install}>Try again</Button> : null)
            : <Button variant="primary" icon={ArrowRight} disabled={!canNext} onClick={() => setStep(order[idx + 1])}>Next</Button>}
        </div>
      </div>
    </div>
  )
}
