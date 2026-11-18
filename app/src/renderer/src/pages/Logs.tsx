import { useEffect, useMemo, useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtAgo, fmtBytes, useLoad } from '@/lib/store'
import type { FileEntry } from '@shared/types'
import { Banner, Empty } from '@/components/ui'

export function LogsPage() {
  const list = useLoad(() => api.logFiles())
  const [open, setOpen] = useState<FileEntry | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => { if (!open && list.data?.length) setOpen(list.data[0]) }, [list.data, open])
  useEffect(() => { if (open) { setText(null); setErr(null); api.readLog(open.rel).then(setText).catch((e) => setErr(e.message)) } }, [open])
  const shown = useMemo(() => {
    if (!text) return ''
    if (!filter.trim()) return text
    const f = filter.toLowerCase()
    return text.split('\n').filter((l) => l.toLowerCase().includes(f)).join('\n')
  }, [text, filter])

  return (
    <div className="split">
      <div className="split__list">
        {list.data && !list.data.length && <Empty icon={ScrollText} title="No logs yet" />}
        {(list.data ?? []).map((f) => (
          <button key={f.rel} className="file" aria-current={open?.rel === f.rel} onClick={() => setOpen(f)}>
            <ScrollText size={15} />
            <span className="truncate" style={{ flex: 1 }}>{f.name}</span>
            <span className="caption faint">{fmtAgo(f.modified)}</span>
          </button>
        ))}
      </div>
      <div className="split__detail">
        <div className="split__bar">
          <Search size={15} className="faint" aria-hidden />
          <input className="input" style={{ maxWidth: 360 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines, e.g. joined, ERROR, a player name" aria-label="Filter log lines" />
          <span className="caption faint" style={{ marginLeft: 'auto' }}>{open ? `${open.name} · ${fmtBytes(open.size)}` : ''}</span>
        </div>
        {err ? <div style={{ padding: 16 }}><Banner tone="error">{err}</Banner></div>
          : <textarea className="editor" readOnly value={text === null ? 'Loading…' : shown || 'No matching lines.'} aria-label="Log contents" />}
      </div>
    </div>
  )
}
