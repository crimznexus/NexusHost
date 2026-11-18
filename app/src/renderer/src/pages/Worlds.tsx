import { Boxes, Download, FolderInput, Package, PackagePlus, RefreshCcw, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtBytes, useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Button, Empty, Panel, confirmDialog, promptDialog } from '@/components/ui'

export function WorldsPage() {
  const { stats, act } = useStore()
  const w = useLoad(() => api.worldInfo(), [stats.state])
  const running = stats.state !== 'stopped' && stats.state !== 'crashed'
  const total = (w.data?.folders ?? []).reduce((s, f) => s + f.size, 0)

  const importFrom = async (kind: 'zip' | 'folder') => {
    const src = kind === 'zip' ? await api.pickFile('Pick a world zip', ['zip']) : await api.pickFolder('Pick a world folder (it contains level.dat)')
    if (!src) return
    if (!(await confirmDialog({ title: 'Replace the current world?', body: 'NexusHost backs up the current world first, then copies the new one in. Players keep their inventories only if they played in that world before.', confirm: 'Import world' }))) return
    await act(() => api.importWorld(src), 'World imported'); w.reload()
  }

  return (
    <>
      {running && <Banner tone="warn">Stop the server to import, reset or change datapacks. Exporting works while it runs.</Banner>}
      <Panel title={`World "${w.data?.levelName ?? 'world'}"`} sub={w.data ? `${fmtBytes(total)} on disk${w.data.seed ? ` · seed ${w.data.seed}` : ''}` : undefined}
        actions={<ActionButton icon={Download} onAction={async () => { const p = await act(() => api.exportWorld()); if (p) act(() => api.openPath(p)) }}>Export as zip</ActionButton>}>
        {w.data && !w.data.folders.length && <Empty icon={Boxes} title="No world yet">A new world is generated the first time the server starts.</Empty>}
        <div className="rows">
          {(w.data?.folders ?? []).map((f) => (
            <div className="row" key={f.name}><span className="avatar"><Boxes size={16} /></span>
              <div><div className="row__title">{f.name.endsWith('_nether') ? 'Nether' : f.name.endsWith('_the_end') ? 'The End' : 'Overworld'}</div><div className="row__meta mono">{f.name}</div></div>
              <span className="small muted tabular">{fmtBytes(f.size)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid">
        <Panel title="Use another world" sub="A singleplayer world or a downloaded map.">
          <div className="cluster">
            <Button icon={PackagePlus} disabled={running} onClick={() => importFrom('zip')}>From zip</Button>
            <Button icon={FolderInput} disabled={running} onClick={() => importFrom('folder')}>From folder</Button>
          </div>
        </Panel>
        <Panel title="Start a fresh world" sub="The current world is backed up, then a new one generates on next start.">
          <Button variant="danger" icon={RefreshCcw} disabled={running} onClick={async () => {
            const seed = await promptDialog({ title: 'Reset the world?', body: 'Leave the seed empty for a random world.', label: 'Seed (optional)', confirm: 'Reset world' })
            if (seed === null) return
            await act(() => api.resetWorld(seed.trim()), 'World reset. Start the server to generate it.'); w.reload()
          }}>Reset world…</Button>
        </Panel>
      </div>

      <Panel title="Datapacks" sub="Add new structures, recipes or rules. They apply on next start." actions={
        <Button icon={PackagePlus} disabled={running} onClick={async () => { const f = await api.pickFile('Pick a datapack zip', ['zip']); if (f) { await act(() => api.addDatapack(f), 'Datapack added'); w.reload() } }}>Add datapack</Button>} tight>
        {w.data && !w.data.datapacks.length && <Empty icon={Package} title="No datapacks" />}
        <div className="rows">
          {(w.data?.datapacks ?? []).map((d) => (
            <div className="row" key={d}><span className="avatar"><Package size={16} /></span><div className="row__title truncate">{d}</div>
              <div className="row__actions"><Button size="sm" variant="ghost" icon={Trash2} label="Remove datapack" disabled={running} onClick={async () => {
                if (await confirmDialog({ title: `Remove ${d}?`, body: 'It moves to the Recycle Bin. Structures it already generated stay in the world.', confirm: 'Remove', danger: true })) { await act(() => api.removeDatapack(d), 'Datapack removed'); w.reload() }
              }} /></div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
