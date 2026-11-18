import { Archive, FolderOpen, History, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtAgo, fmtBytes, useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Button, Empty, Field, Panel, ToggleRow, confirmDialog } from '@/components/ui'

export function BackupsPage() {
  const { stats, settings, setSettings, act } = useStore()
  const list = useLoad(() => api.backups())
  const info = useLoad(() => api.serverInfo())
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const save = async (patch: Partial<NonNullable<typeof settings>['backups']>) => { if (!settings) return; setSettings(await api.saveSettings({ backups: { ...settings.backups, ...patch } })) }

  return (
    <>
      <div className="grid">
        <Panel title="Back up now" sub="Zips the world. While the server runs, saving pauses for a moment so the copy is clean.">
          <div className="cluster">
            <ActionButton variant="primary" icon={Archive} onAction={async () => { await act(() => api.createBackup(), 'Backup saved'); list.reload() }}>Back up now</ActionButton>
            <Button variant="ghost" icon={FolderOpen} onClick={() => info.data && api.openPath(info.data.dir + '\\backups')}>Open folder</Button>
          </div>
        </Panel>
        <Panel title="Automatic backups">
          {settings && <>
            <ToggleRow title="Daily backup" hint={settings.backups.lastRun ? `Last one ${fmtAgo(Date.parse(settings.backups.lastRun))}` : 'Runs while NexusHost is open'} checked={settings.backups.daily} onChange={(v) => save({ daily: v })} />
            <Field label="Keep this many daily backups" hint="Older automatic backups are deleted. Manual backups are always kept.">
              <input className="input" type="number" min={1} max={100} value={settings.backups.keep} onChange={(e) => save({ keep: Number(e.target.value) || 1 })} style={{ maxWidth: 120 }} />
            </Field>
          </>}
        </Panel>
      </div>

      <Panel title="Saved backups" sub={list.data ? `${list.data.length} backups · ${fmtBytes(list.data.reduce((s, b) => s + b.size, 0))}` : undefined} tight>
        {running && <div style={{ padding: '0 20px 12px' }}><Banner tone="warn">Stop the server to restore a backup.</Banner></div>}
        {list.data && !list.data.length && <Empty icon={Archive} title="No backups yet" />}
        <div className="rows">
          {(list.data ?? []).map((b) => (
            <div className="row" key={b.file}><span className="avatar"><Archive size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="cluster" style={{ flexWrap: 'nowrap' }}><span className="row__title truncate">{new Date(b.created).toLocaleString()}</span>{b.auto && <span className="tag">daily</span>}</div>
                <div className="row__meta">{fmtBytes(b.size)} · {fmtAgo(b.created)}</div>
              </div>
              <div className="row__actions">
                <Button size="sm" icon={History} disabled={running} onClick={async () => {
                  if (await confirmDialog({ title: 'Restore this backup?', body: `The world goes back to ${new Date(b.created).toLocaleString()}. The current world is backed up first, so you can undo this.`, confirm: 'Restore' })) {
                    await act(() => api.restoreBackup(b.file), 'Backup restored'); list.reload()
                  }
                }}>Restore</Button>
                <Button size="sm" variant="ghost" icon={Trash2} label="Delete backup" onClick={async () => {
                  if (await confirmDialog({ title: 'Delete this backup?', body: 'It moves to the Recycle Bin.', confirm: 'Delete', danger: true })) { await act(() => api.deleteBackup(b.file)); list.reload() }
                }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
