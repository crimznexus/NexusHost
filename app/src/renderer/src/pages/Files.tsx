import { useEffect, useState } from 'react'
import { ChevronRight, File, FileText, Folder, FolderOpen, Home, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtBytes, useLoad, useStore } from '@/lib/store'
import type { FileEntry } from '@shared/types'
import { ActionButton, Banner, Button, Empty } from '@/components/ui'

export function FilesPage() {
  const { act, settings } = useStore()
  const [dir, setDir] = useState('')
  const [open, setOpen] = useState<FileEntry | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [orig, setOrig] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const list = useLoad(() => api.listFiles(dir), [dir])
  useEffect(() => {
    if (!open) return
    setText(null); setErr(null)
    api.readFile(open.rel).then((t) => { setText(t); setOrig(t) }).catch((e) => setErr(e.message))
  }, [open])
  const dirty = text !== null && text !== orig
  const parts = dir ? dir.split('/') : []

  return (
    <div className="split">
      <div className="split__list">
        <nav className="crumbs" aria-label="Folder">
          <button onClick={() => setDir('')} aria-label="Server folder"><Home size={14} /></button>
          {parts.map((p, i) => <span key={i} className="cluster" style={{ gap: 2 }}><ChevronRight size={12} className="faint" /><button onClick={() => setDir(parts.slice(0, i + 1).join('/'))}>{p}</button></span>)}
        </nav>
        {list.error && <div style={{ padding: 12 }}><Banner tone="error">{list.error}</Banner></div>}
        {list.data && !list.data.length && <Empty icon={Folder} title="Empty folder" />}
        {(list.data ?? []).map((f) => (
          <button key={f.rel} className="file" aria-current={open?.rel === f.rel} onClick={() => f.dir ? setDir(f.rel) : setOpen(f)}>
            {f.dir ? <Folder size={15} /> : /\.(ya?ml|properties|json|txt|toml|conf|log)$/i.test(f.name) ? <FileText size={15} /> : <File size={15} />}
            <span className="truncate" style={{ flex: 1 }}>{f.name}</span>
            {!f.dir && <span className="caption faint tabular">{fmtBytes(f.size)}</span>}
          </button>
        ))}
      </div>
      <div className="split__detail">
        <div className="split__bar">
          <span className="mono truncate" style={{ flex: 1 }}>{open?.rel ?? 'Pick a file to view or edit'}</span>
          <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => settings?.serverDir && api.openPath(settings.serverDir + (dir ? '\\' + dir.replace(/\//g, '\\') : ''))}>Show in Explorer</Button>
          {open && <ActionButton size="sm" variant="primary" icon={Save} disabled={!dirty} onAction={async () => { await act(() => api.writeFile(open.rel, text!), 'Saved (the old version is kept as .bak)'); setOrig(text!) }}>Save</ActionButton>}
        </div>
        {err ? <div style={{ padding: 16 }}><Banner tone="warn">{err}</Banner></div>
          : text !== null ? <textarea className="editor" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Contents of ${open?.name}`} />
          : <Empty icon={FileText} title={open ? 'Loading…' : 'No file open'}><span className="small">Configs, json and logs can be edited here. Most changes need a server restart.</span></Empty>}
      </div>
    </div>
  )
}
