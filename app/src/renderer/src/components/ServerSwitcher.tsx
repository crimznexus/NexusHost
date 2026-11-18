import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus, Server } from 'lucide-react'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'

/** Sidebar header: shows the active server and lets you switch to another one or add a new one. */
export function ServerSwitcher({ onAdd }: { onAdd: () => void }) {
  const { settings, stats, act } = useStore()
  const [open, setOpen] = useState(false)
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const box = useRef<HTMLDivElement>(null)
  const servers = settings?.servers ?? []
  const active = servers.find((s) => s.id === settings?.activeServerId)
  const locked = stats.state !== 'stopped' && stats.state !== 'crashed'

  useEffect(() => {
    for (const s of servers) if (!(s.id in icons)) api.serverIconData(s.dir).then((d) => setIcons((m) => ({ ...m, [s.id]: d }))).catch(() => {})
  }, [servers.map((s) => s.id).join()])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const icon = (id: string | undefined) => (id && icons[id]) ? <img src={icons[id]!} alt="" /> : <Server size={16} aria-hidden />
  const pick = async (id: string) => {
    if (id === active?.id) { setOpen(false); return }
    const r = await act(() => api.switchServer(id))
    if (r) location.reload()
  }

  return (
    <div className="switcher" ref={box}>
      <button type="button" className="switcher__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="switcher__icon">{icon(active?.id)}</span>
        <span className="switcher__text">
          <span className="brand__name truncate">{settings?.serverName}</span>
          <span className="brand__sub truncate">{servers.length > 1 ? `${servers.length} servers` : 'NexusHost'}</span>
        </span>
        <ChevronsUpDown size={15} className="faint" aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Servers">
          <div className="overline menu__label">Servers</div>
          {servers.map((s) => {
            const isActive = s.id === active?.id
            return (
              <button key={s.id} type="button" role="menuitemradio" aria-checked={isActive} className="menu__item" disabled={!isActive && locked}
                title={!isActive && locked ? 'Stop the running server to switch' : s.dir} onClick={() => pick(s.id)}>
                <span className="switcher__icon switcher__icon--sm">{icon(s.id)}</span>
                <span className="switcher__text">
                  <span className="row__title truncate">{s.name}</span>
                  <span className="caption faint truncate">{s.mcVersion ? `Paper ${s.mcVersion} · ` : ''}{s.dir}</span>
                </span>
                {isActive && <Check size={15} className="menu__check" aria-hidden />}
              </button>
            )
          })}
          {locked && servers.length > 1 && <div className="caption faint menu__note">Stop the running server to switch.</div>}
          <div className="menu__sep" />
          <button type="button" role="menuitem" className="menu__item" disabled={locked} onClick={() => { setOpen(false); onAdd() }}>
            <span className="switcher__icon switcher__icon--sm"><Plus size={15} aria-hidden /></span>
            <span className="row__title">Add server</span>
          </button>
        </div>
      )}
    </div>
  )
}
