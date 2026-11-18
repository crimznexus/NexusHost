import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import type { ServerState } from '@shared/types'
import { useStore } from '@/lib/store'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  icon?: LucideIcon
  loading?: boolean
  label?: string // for icon-only buttons
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, label, children, className = '', disabled, ...rest }: BtnProps) {
  const iconOnly = !children
  const cls = `btn btn--${variant} ${size === 'sm' ? 'btn--sm' : ''} ${iconOnly ? 'btn--icon' : ''} ${className}`
  const s = size === 'sm' ? 14 : 16
  return (
    <button type="button" className={cls} disabled={disabled || loading} aria-label={iconOnly ? label : undefined} title={label} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={s} className="spin" aria-hidden /> : Icon ? <Icon size={s} aria-hidden /> : null}
      {children}
    </button>
  )
}

/** Button that runs an async action and shows a spinner while it runs. */
export function ActionButton({ onAction, ...p }: Omit<BtnProps, 'onClick' | 'loading'> & { onAction: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  return <Button {...p} loading={busy} onClick={async () => { setBusy(true); try { await onAction() } finally { setBusy(false) } }} />
}

export function Panel({ title, sub, actions, children, tight, className = '' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; tight?: boolean; className?: string }) {
  return (
    <section className={`panel ${tight ? 'panel--tight' : ''} ${className}`}>
      {(title || actions) && (
        <header className="panel__head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="panel__title">{title}</h2>}
            {sub && <p className="panel__sub">{sub}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, error, children }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      {label && <span className="field__label">{label}</span>}
      {children}
      {(error || hint) && <span className="field__hint">{error || hint}</span>}
    </label>
  )
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="switch__knob">{checked && <Check size={11} strokeWidth={3} aria-hidden />}</span>
    </button>
  )
}

export function ToggleRow({ title, hint, checked, onChange, disabled }: { title: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle">
      <div className="toggle__text">
        <div className="toggle__title">{title}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={typeof title === 'string' ? title : 'Toggle'} />
    </div>
  )
}

const STATE: Record<ServerState, { label: string; tone: 'online' | 'busy' | 'error' | 'idle' }> = {
  online: { label: 'Online', tone: 'online' }, starting: { label: 'Starting', tone: 'busy' }, stopping: { label: 'Stopping', tone: 'busy' },
  stopped: { label: 'Offline', tone: 'idle' }, crashed: { label: 'Crashed', tone: 'error' }, external: { label: 'Running elsewhere', tone: 'busy' }
}
export const stateLabel = (s: ServerState) => STATE[s].label

export function StatusPill({ state }: { state: ServerState }) {
  const t = STATE[state]
  return <span className="pill"><span className={`dot ${t.tone !== 'idle' ? `dot--${t.tone}` : ''}`} aria-hidden />{t.label}</span>
}

export function Beacon({ state }: { state: ServerState }) {
  return (
    <div className={`beacon beacon--${STATE[state].tone}`} role="img" aria-label={`Server ${STATE[state].label}`}>
      <span className="beacon__ambient" /><span className="beacon__halo" /><span className="beacon__core" />
    </div>
  )
}

export function Stat({ label, value, unit, meter }: { label: string; value: ReactNode; unit?: string; meter?: number | null }) {
  return (
    <div className="stat">
      <span className="overline">{label}</span>
      <span className="stat__value">{value}{unit && <small>{unit}</small>}</span>
      {meter != null && <div className="meter" aria-hidden><div className="meter__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, meter))})` }} /></div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="empty"><Icon size={28} aria-hidden /><strong>{title}</strong>{children}</div>
}

export function Banner({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'error' ? XCircle : tone === 'ok' ? CheckCircle2 : Info
  return <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : undefined}><Icon size={16} aria-hidden /><div className="banner__body">{children}</div>{action}</div>
}

export function Progress({ value }: { value: number | null }) {
  return (
    <div className={`progress ${value == null ? 'progress--indet' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(value * 100)}>
      <div className="progress__fill" style={value == null ? undefined : { transform: `scaleX(${value})` }} />
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className="seg__btn" onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden><strong className="caption">{name.slice(0, 2).toUpperCase()}</strong></span>
}

export function Toasts() {
  const { toasts, dismiss } = useStore()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? XCircle : t.kind === 'success' ? CheckCircle2 : Info
        return <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => dismiss(t.id)}><Icon size={16} aria-hidden /><span className="wrap-any">{t.text}</span></div>
      })}
    </div>
  )
}

// ---------- dialogs: confirm / prompt as promises ----------
interface DialogReq { title: string; body?: ReactNode; confirm: string; danger?: boolean; input?: { label: string; value: string; placeholder?: string }; resolve: (v: string | boolean | null) => void }
let openDialog: ((r: DialogReq) => void) | null = null

export function confirmDialog(o: { title: string; body?: ReactNode; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => openDialog?.({ ...o, confirm: o.confirm ?? 'Continue', resolve: (v) => resolve(v === true) }))
}
export function promptDialog(o: { title: string; body?: ReactNode; label: string; value?: string; placeholder?: string; confirm?: string }): Promise<string | null> {
  return new Promise((resolve) => openDialog?.({ title: o.title, body: o.body, confirm: o.confirm ?? 'OK', input: { label: o.label, value: o.value ?? '', placeholder: o.placeholder }, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

export function DialogHost() {
  const [req, setReq] = useState<DialogReq | null>(null)
  const [val, setVal] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { openDialog = (r) => { setReq(r); setVal(r.input?.value ?? '') }; return () => { openDialog = null } }, [])
  useEffect(() => { if (req && ref.current && !ref.current.open) ref.current.showModal() }, [req])
  const close = (v: string | boolean | null) => { req?.resolve(v); ref.current?.close(); setReq(null) }
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); close(null) }}>
      {req && (
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); close(req.input ? val : true) }}>
          <div className="dialog__body">
            <h2 className="dialog__title">{req.title}</h2>
            {req.body && <div className="muted">{req.body}</div>}
            {req.input && <Field label={req.input.label}><input className="input" autoFocus value={val} placeholder={req.input.placeholder} onChange={(e) => setVal(e.target.value)} /></Field>}
          </div>
          <div className="dialog__foot">
            <Button variant="ghost" onClick={() => close(null)}>Cancel</Button>
            <button type="submit" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`} autoFocus={!req.input}>{req.confirm}</button>
          </div>
        </form>
      )}
    </dialog>
  )
}
