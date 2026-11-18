import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { Button } from '@/components/ui'

const QUICK = ['list', 'save-all', 'time set day', 'weather clear', 'tps']

export function ConsolePage() {
  const { logs, stats, act } = useStore()
  const [cmd, setCmd] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const running = stats.state === 'online' || stats.state === 'starting'

  useLayoutEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight }, [logs, follow])
  useEffect(() => { box.current && (box.current.scrollTop = box.current.scrollHeight) }, [])

  const send = async (c: string) => {
    if (!c.trim()) return
    setHist((h) => [c, ...h.filter((x) => x !== c)].slice(0, 50)); setHi(-1); setCmd(''); setFollow(true)
    await act(() => api.sendCommand(c))
  }

  return (
    <div className="console">
      <div className="console__log" ref={box} role="log" aria-live="off"
        onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40) }}>
        {logs.map((l) => <div key={l.id} className={`console__line--${l.level}`}>{l.text}</div>)}
        {!logs.length && <div className="console__line--system">Console output appears here once the server starts.</div>}
      </div>
      <form className="console__bar" onSubmit={(e) => { e.preventDefault(); send(cmd) }}>
        {!follow && <Button size="md" icon={ArrowDown} label="Jump to latest" onClick={() => setFollow(true)} />}
        <input className="console__input" value={cmd} disabled={!running} aria-label="Server command"
          placeholder={running ? 'Type a command, e.g. whitelist add steve' : 'Start the server to send commands'}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); const n = Math.min(hi + 1, hist.length - 1); setHi(n); setCmd(hist[n]) }
            if (e.key === 'ArrowDown') { e.preventDefault(); const n = hi - 1; setHi(n); setCmd(n >= 0 ? hist[n] : '') }
          }} />
        {QUICK.map((q) => <Button key={q} size="md" variant="ghost" disabled={!running} onClick={() => send(q)} className="mono">{q}</Button>)}
        <Button variant="primary" icon={Send} disabled={!running || !cmd.trim()} onClick={() => send(cmd)}>Send</Button>
      </form>
    </div>
  )
}
