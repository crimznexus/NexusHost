import { useState } from 'react'
import { Coffee, FolderOpen, FolderSearch } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Button, Field, Panel, ToggleRow, confirmDialog } from '@/components/ui'

export function SettingsPage() {
  const { settings, setSettings, stats, act, toast } = useStore()
  const sys = useLoad(() => api.systemInfo())
  const [name, setName] = useState(settings?.serverName ?? '')
  if (!settings) return null
  const save = async (patch: Partial<AppSettings>) => { const s = await act(() => api.saveSettings(patch)); if (s) setSettings(s) }
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const maxMem = Math.max(2, (sys.data?.totalMemGB ?? 16) - 2)

  return (
    <>
      <div className="grid">
        <Panel title="Server">
          <div className="stack">
            <Field label="Name" hint="Used in the app, the friend installer and their launcher profile">
              <div className="input-group"><input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                <Button disabled={!name.trim() || name === settings.serverName} onClick={() => save({ serverName: name.trim() })}>Save</Button></div>
            </Field>
            <Field label={`Memory: ${settings.memoryGB} GB`} hint={`This PC has ${sys.data?.totalMemGB ?? '?'} GB. Leave at least 4 GB for Windows${settings.memoryGB > maxMem - 2 ? ' – this is very high' : ''}. Applies on next start.`}>
              <input className="range" type="range" min={2} max={maxMem} step={1} value={settings.memoryGB} onChange={(e) => save({ memoryGB: Number(e.target.value) })} />
            </Field>
            <Field label="Server folder"><div className="input-group"><input className="input mono" readOnly value={settings.serverDir ?? ''} />
              <Button icon={FolderOpen} label="Open folder" onClick={() => api.openPath(settings.serverDir!)} /></div></Field>
          </div>
        </Panel>
        <Panel title="Java">
          <div className="stack">
            <Field label="Java used to run the server"><input className="input mono" readOnly value={settings.javaPath ?? 'Not found'} /></Field>
            <div className="cluster">
              <ActionButton icon={FolderSearch} onAction={async () => {
                const min = await api.javaMinimum(settings.mcVersion); const j = await api.findJava(min)
                if (j) { await save({ javaPath: j.path }); toast('success', `Using Java ${j.major}`) } else toast('error', `Java ${min} or newer was not found.`)
              }}>Find Java</ActionButton>
              <ActionButton icon={Coffee} onAction={async () => { const min = await api.javaMinimum(settings.mcVersion); await api.installJava(min) }}>Install Java</ActionButton>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Behaviour">
        <div className="grid">
          <div>
            <ToggleRow title="Start NexusHost with Windows" hint="Opens hidden in the tray" checked={settings.startWithWindows} onChange={(v) => save({ startWithWindows: v })} />
            <ToggleRow title="Start the server when NexusHost opens" checked={settings.autoStartServer} onChange={(v) => save({ autoStartServer: v })} />
            <ToggleRow title="Keep running in the tray when the window closes" hint="The server keeps running; quit from the tray icon" checked={settings.closeToTray} onChange={(v) => save({ closeToTray: v })} />
          </div>
          <div>
            <ToggleRow title="Restart after a crash" hint="Up to 3 times in 10 minutes" checked={settings.autoRestart} onChange={(v) => save({ autoRestart: v })} />
            <ToggleRow title="Stop when nobody is online" hint={settings.autoStopMinutes ? `After ${settings.autoStopMinutes} minutes empty. Saves power on a laptop.` : 'Off'} checked={settings.autoStopMinutes > 0} onChange={(v) => save({ autoStopMinutes: v ? 30 : 0 })} />
            {settings.autoStopMinutes > 0 && <Field label="Minutes before auto-stop"><input className="input" type="number" min={5} max={720} value={settings.autoStopMinutes} onChange={(e) => save({ autoStopMinutes: Number(e.target.value) || 30 })} style={{ maxWidth: 120 }} /></Field>}
          </div>
        </div>
      </Panel>

      <Panel title="Use a different server" sub="Point NexusHost at another server folder or set up a new one. The current folder is not deleted.">
        {running && <Banner tone="warn">Stop the server first.</Banner>}
        <Button disabled={running} onClick={async () => {
          if (await confirmDialog({ title: 'Run setup again?', body: 'You can pick an existing server folder or create a new one.', confirm: 'Open setup' })) setSettings(await api.saveSettings({ serverDir: null }))
        }}>Run setup again…</Button>
      </Panel>
      <p className="caption faint">NexusHost {sys.data?.appVersion} · settings in <span className="mono wrap-any">{sys.data?.userData}</span></p>
    </>
  )
}
