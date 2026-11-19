import { useEffect, useMemo, useState } from 'react'
import { ImageUp, RotateCcw, Save, Wand2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Button, Field, Panel, ToggleRow, confirmDialog } from '@/components/ui'

type Kind = { key: string; label: string; hint?: string } & ({ type: 'text' } | { type: 'number'; min: number; max: number } | { type: 'bool' } | { type: 'select'; options: string[] })

const GENERAL: Kind[] = [
  { key: 'motd', label: 'Message of the day', hint: 'Shown under the server name in the Multiplayer list', type: 'text' },
  { key: 'max-players', label: 'Max players', type: 'number', min: 1, max: 200 },
  { key: 'difficulty', label: 'Difficulty', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'gamemode', label: 'Default game mode', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
  { key: 'view-distance', label: 'View distance (chunks)', hint: 'Lower helps a weak PC. 8-10 is a good range.', type: 'number', min: 3, max: 32 },
  { key: 'simulation-distance', label: 'Simulation distance (chunks)', type: 'number', min: 3, max: 32 },
  { key: 'spawn-protection', label: 'Spawn protection (blocks)', hint: '0 lets everyone build at spawn', type: 'number', min: 0, max: 64 },
  { key: 'server-port', label: 'Port', hint: 'Keep 25565 unless you run two servers', type: 'number', min: 1, max: 65535 }
]
const RULES: Kind[] = [
  { key: 'pvp', label: 'PvP', hint: 'Players can hurt each other', type: 'bool' },
  { key: 'hardcore', label: 'Hardcore', hint: 'Players become spectators when they die', type: 'bool' },
  { key: 'allow-flight', label: 'Allow flight', hint: 'Stops kicks for "flying" with some mods or lag', type: 'bool' },
  { key: 'allow-nether', label: 'Nether', type: 'bool' },
  { key: 'spawn-monsters', label: 'Monsters', type: 'bool' },
  { key: 'enable-command-block', label: 'Command blocks', type: 'bool' },
  { key: 'force-gamemode', label: 'Force game mode on join', type: 'bool' }
]
const DEFAULTS: Record<string, string> = { pvp: 'true', hardcore: 'false', 'allow-flight': 'false', 'allow-nether': 'true', 'spawn-monsters': 'true', 'enable-command-block': 'false', 'force-gamemode': 'false', gamemode: 'survival', difficulty: 'easy' }

export function OptionsPage() {
  const { stats, act } = useStore()
  const props = useLoad(() => api.getProperties())
  const info = useLoad(() => api.serverInfo())
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => { api.serverIconData().then(setIcon).catch(() => {}) }, [])
  const val = (k: string) => draft[k] ?? props.data?.[k] ?? DEFAULTS[k] ?? ''
  const dirty = Object.keys(draft).length > 0
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    for (const f of GENERAL) if (f.type === 'number' && draft[f.key] !== undefined) {
      const n = Number(draft[f.key]); if (!Number.isInteger(n) || n < f.min || n > f.max) e[f.key] = `Use a whole number from ${f.min} to ${f.max}`
    }
    return e
  }, [draft])

  const save = async () => {
    await act(() => api.setProperties(draft), running ? 'Saved. Restart the server to apply.' : 'Saved')
    setDraft({}); props.reload()
  }

  return (
    <>
      {running && <Banner>Most options apply after a restart.</Banner>}
      <Panel title="General" actions={<>
        <Button variant="ghost" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft({})}>Discard</Button>
        <ActionButton variant="primary" icon={Save} disabled={!dirty || Object.keys(errors).length > 0} onAction={save}>Save</ActionButton></>}>
        <div className="grid">
          {GENERAL.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
              {f.type === 'select'
                ? <select className="select" value={val(f.key)} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                : <input className="input" inputMode={f.type === 'number' ? 'numeric' : undefined} value={val(f.key)} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="Gameplay">
        <div className="grid">
          {[RULES.slice(0, 4), RULES.slice(4)].map((col, i) => (
            <div key={i}>{col.map((f) => <ToggleRow key={f.key} title={f.label} hint={f.hint} checked={val(f.key) === 'true'} onChange={(v) => setDraft({ ...draft, [f.key]: String(v) })} />)}</div>
          ))}
        </div>
      </Panel>

      <OfflineMode onlineMode={info.data?.onlineMode ?? true} running={running} onDone={() => { info.reload(); props.reload() }} />

      <div className="grid">
        <Panel title="Server icon" sub="Shown next to the server in the Multiplayer list. Applies after a restart.">
          <div className="cluster cluster--lg">
            <span className="avatar" style={{ width: 64, height: 64 }}>{icon ? <img src={icon} alt="Current server icon" /> : null}</span>
            <div className="cluster">
              <Button icon={ImageUp} onClick={async () => { const f = await api.pickFile('Pick an image', ['png', 'jpg', 'jpeg']); if (f) { await act(() => api.setServerIcon(f, null), 'Icon updated'); setIcon(await api.serverIconData()) } }}>Upload image</Button>
              <Button icon={Wand2} onClick={async () => { const s = await api.getSettings(); await act(() => api.setServerIcon(null, s.iconText || s.serverName.split(' ')[0]), 'Icon drawn'); setIcon(await api.serverIconData()) }}>Draw one</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Minecraft EULA" sub="The server only starts after the owner accepts it.">
          {info.data?.eulaAccepted ? <Banner tone="ok">Accepted.</Banner> : (
            <div className="stack">
              <span className="small">Read it at <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">aka.ms/MinecraftEULA</a>.</span>
              <ActionButton variant="primary" onAction={async () => { await act(() => api.setProperties({ eula: 'true' }), 'EULA accepted'); info.reload() }}>I accept the Minecraft EULA</ActionButton>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

function OfflineMode({ onlineMode, running, onDone }: { onlineMode: boolean; running: boolean; onDone: () => void }) {
  const { act, settings } = useStore()
  const [open, setOpen] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [report, setReport] = useState<string[] | null>(null)
  const players = useLoad(() => api.players(), [open])
  const people = useMemo(() => {
    const s = new Set<string>(); for (const l of [players.data?.whitelist ?? [], players.data?.ops ?? []]) for (const e of l) s.add(e.name); return [...s]
  }, [players.data])

  const apply = async () => {
    const goingOffline = onlineMode
    const ok = await confirmDialog({
      title: goingOffline ? 'Turn on offline mode?' : 'Turn off offline mode?',
      body: goingOffline
        ? 'TLauncher and other non-premium launchers can join. Each player keeps their saves under their new ID. ' + (settings?.loader === 'paper' || !settings?.loader
          ? 'NexusGuard is installed with it: each name locks to the Tailscale account that first joins with it, so each name can only be used by its owner.'
          : 'Name protection (NexusGuard) needs a Paper server, so anyone on your whitelist could join under another name. Only whitelist people you trust.')
        : 'Only real Minecraft accounts can join again. Players without one (TLauncher) will be locked out.',
      confirm: goingOffline ? 'Turn on' : 'Turn off'
    })
    if (!ok) return
    const renames = Object.fromEntries(Object.entries(names).filter(([k, v]) => v.trim() && v !== k))
    const r = await act(() => api.setOfflineMode(goingOffline, renames))
    if (r) { setReport(r); setOpen(false); onDone() }
  }

  return (
    <Panel title="Offline mode (TLauncher)" sub={onlineMode ? 'Off: only players with a bought Minecraft account can join.' : 'On: TLauncher and other non-premium launchers can join.'}
      actions={<Button variant={onlineMode ? 'primary' : 'secondary'} disabled={running} onClick={() => setOpen(!open)}>{onlineMode ? 'Turn on…' : 'Turn off…'}</Button>}>
      {running && <Banner tone="warn">Stop the server to change this.</Banner>}
      {open && (
        <div className="stack">
          <span className="small muted">Player saves are moved to the ID each player gets in the new mode. In offline mode capitals matter: check each name is spelled exactly as the player types it in their launcher.</span>
          {people.map((n) => (
            <Field key={n} label={`${n} logs in as`}><input className="input" value={names[n] ?? n} onChange={(e) => setNames({ ...names, [n]: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 16) })} /></Field>
          ))}
          <div className="cluster"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><ActionButton variant="primary" onAction={apply}>Apply</ActionButton></div>
        </div>
      )}
      {report && <Banner tone="ok"><div className="stack" style={{ gap: 2 }}>{report.map((l, i) => <span key={i} className="small wrap-any">{l}</span>)}</div></Banner>}
    </Panel>
  )
}
