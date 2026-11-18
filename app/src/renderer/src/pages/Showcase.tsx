// Dev-only primitive showcase (open with ?showcase). Every primitive and state from DESIGN.md §5.
import { useState } from 'react'
import { Download, Play, Puzzle, Trash2, UserPlus } from 'lucide-react'
import { ActionButton, Avatar, Banner, Beacon, Button, confirmDialog, Empty, Field, Panel, Progress, promptDialog, Seg, Stat, StatusPill, ToggleRow } from '@/components/ui'
import { useStore } from '@/lib/store'
import type { ServerState } from '@shared/types'

export function Showcase() {
  const { toast } = useStore()
  const [on, setOn] = useState(true)
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a')
  const states: ServerState[] = ['online', 'starting', 'stopping', 'stopped', 'crashed', 'external']
  return (
    <div className="page" style={{ height: '100dvh' }}>
      <div className="page__inner">
        <h1 className="topbar__title">Primitive showcase</h1>
        <Panel title="Buttons" sub="primary / secondary / ghost / danger, sm, icon-only, disabled, loading">
          <div className="stack">
            <div className="cluster">
              <Button variant="primary" icon={Play}>Start</Button>
              <Button icon={Download}>Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger" icon={Trash2}>Delete</Button>
              <Button icon={UserPlus} label="Add player" />
            </div>
            <div className="cluster">
              <Button variant="primary" size="sm">Small</Button>
              <Button size="sm" icon={Trash2} label="Remove" />
              <Button variant="primary" disabled>Disabled</Button>
              <Button loading>Loading</Button>
              <ActionButton variant="primary" onAction={() => new Promise((r) => setTimeout(r, 1500))}>Async action</ActionButton>
            </div>
          </div>
        </Panel>
        <div className="grid">
          <Panel title="Fields">
            <div className="stack">
              <Field label="Server name" hint="Shown in the launcher"><input className="input" defaultValue="Friends Server" /></Field>
              <Field label="Port" error="Port must be between 1 and 65535"><input className="input" defaultValue="99999" /></Field>
              <Field label="Difficulty"><select className="select" defaultValue="easy"><option>peaceful</option><option>easy</option><option>normal</option><option>hard</option></select></Field>
              <Field label="Disabled"><input className="input" disabled value="read only" /></Field>
              <Field label="An unbroken string"><input className="input" defaultValue="C:\\Users\\someone\\AppData\\Roaming\\NexusHost\\friend-kit\\Install-AVeryLongServerNameThatKeepsGoing-Mods.bat" /></Field>
            </div>
          </Panel>
          <Panel title="Toggles and tabs">
            <ToggleRow title="Whitelist" hint="Only listed players can join" checked={on} onChange={setOn} />
            <ToggleRow title="Offline mode" hint="Lets TLauncher players join" checked={!on} onChange={(v) => setOn(!v)} />
            <ToggleRow title="Disabled toggle" checked={false} onChange={() => {}} disabled />
            <div style={{ marginTop: 12 }}><Seg value={tab} onChange={setTab} options={[{ value: 'a', label: 'Installed' }, { value: 'b', label: 'Browse' }, { value: 'c', label: 'Updates' }]} /></div>
          </Panel>
        </div>
        <Panel title="Status: beacon and pills">
          <div className="cluster cluster--lg">
            {states.map((s) => <div key={s} className="stack" style={{ alignItems: 'center' }}><Beacon state={s} /><StatusPill state={s} /></div>)}
          </div>
        </Panel>
        <div className="grid">
          <Panel title="Stats"><div className="cluster cluster--lg"><Stat label="Players" value="2" unit="/ 12" /><Stat label="CPU" value="14" unit="%" meter={0.14} /><Stat label="Memory" value="5.0" unit="GB" meter={0.62} /><Stat label="TPS" value="19.9" /></div></Panel>
          <Panel title="Progress"><div className="stack"><Progress value={0.4} /><Progress value={null} /></div></Panel>
        </div>
        <Panel title="Rows" tight>
          <div className="rows">
            <div className="row"><Avatar name="steve" /><div><div className="row__title truncate">steve</div><div className="row__meta">Operator</div></div><div className="row__actions"><Button size="sm" variant="ghost">Kick</Button></div></div>
            <div className="row"><Avatar name="a_really_long_player_name" /><div><div className="row__title truncate">a_really_long_player_name_that_should_truncate_cleanly_in_the_row</div><div className="row__meta">Whitelisted</div></div><div className="row__actions"><Button size="sm" icon={Trash2} label="Remove" variant="ghost" /></div></div>
          </div>
        </Panel>
        <div className="grid">
          <Panel title="Empty state"><Empty icon={Puzzle} title="No plugins yet"><span className="small">Browse Modrinth to add one.</span></Empty></Panel>
          <Panel title="Banners"><div className="stack"><Banner>Changes apply after a restart.</Banner><Banner tone="warn">Stop the server to change this.</Banner><Banner tone="error">Java 25 was not found.</Banner><Banner tone="ok">Firewall is ready.</Banner></div></Panel>
        </div>
        <Panel title="Dialogs and toasts">
          <div className="cluster">
            <Button onClick={() => confirmDialog({ title: 'Restore this backup?', body: 'The current world is backed up first.', confirm: 'Restore' })}>Confirm</Button>
            <Button variant="danger" onClick={() => confirmDialog({ title: 'Reset the world?', body: 'A new world is generated.', confirm: 'Reset', danger: true })}>Danger confirm</Button>
            <Button onClick={() => promptDialog({ title: 'Add to whitelist', label: 'Minecraft name', placeholder: 'steve' })}>Prompt</Button>
            <Button onClick={() => toast('success', 'Backup saved.')}>Success toast</Button>
            <Button onClick={() => toast('error', 'Could not reach Modrinth. Check your internet connection.')}>Error toast</Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
