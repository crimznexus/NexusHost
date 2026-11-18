import { useState } from 'react'
import { Ban, Crown, ShieldOff, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { useLoad, useStore } from '@/lib/store'
import { ActionButton, Avatar, Banner, Button, Empty, Panel, promptDialog, Seg, ToggleRow, confirmDialog } from '@/components/ui'

type Tab = 'whitelist' | 'ops' | 'banned'

export function PlayersPage() {
  const { stats, act } = useStore()
  const p = useLoad(() => api.players(), [stats.players.join(','), stats.state])
  const [tab, setTab] = useState<Tab>('whitelist')
  const running = stats.state === 'online'
  const run = async (action: Parameters<typeof api.playerAction>[0], name: string, done: string, reason?: string) => {
    await act(() => api.playerAction(action, name, reason), done)
    setTimeout(() => p.reload(), running ? 700 : 0)
  }
  const add = async () => {
    const what = tab === 'whitelist' ? 'Add to whitelist' : tab === 'ops' ? 'Make operator' : 'Ban player'
    const name = await promptDialog({ title: what, label: 'Minecraft name', placeholder: 'steve',
      body: p.data && !p.data.onlineMode ? 'Offline mode is on: type the name exactly as the player does, capitals included.' : undefined, confirm: what })
    if (!name) return
    if (tab === 'whitelist') await run('whitelist-add', name.trim(), `${name} can join now`)
    else if (tab === 'ops') await run('op', name.trim(), `${name} is now an operator`)
    else await run('ban', name.trim(), `${name} is banned`)
  }

  const d = p.data
  const list = d ? (tab === 'whitelist' ? d.whitelist : tab === 'ops' ? d.ops : d.banned) : []
  return (
    <>
      <Panel title="Online now" sub={running ? `${stats.players.length} of ${stats.maxPlayers}` : 'Server is offline'} tight>
        {stats.players.length ? (
          <div className="rows">
            {stats.players.map((n) => {
              const isOp = d?.ops.some((o) => o.name.toLowerCase() === n.toLowerCase())
              return (
                <div className="row" key={n}><Avatar name={n} />
                  <div><div className="row__title truncate">{n}</div><div className="row__meta">{isOp ? 'Operator' : 'Player'}</div></div>
                  <div className="row__actions">
                    <ActionButton size="sm" variant="ghost" icon={Crown} label={isOp ? 'Remove operator' : 'Make operator'} onAction={() => run(isOp ? 'deop' : 'op', n, isOp ? `${n} is no longer an operator` : `${n} is now an operator`)} />
                    <ActionButton size="sm" variant="ghost" onAction={() => run('kick', n, `Kicked ${n}`)}>Kick</ActionButton>
                    <Button size="sm" variant="ghost" icon={Ban} label="Ban" onClick={async () => { if (await confirmDialog({ title: `Ban ${n}?`, body: 'They are kicked and cannot join again until pardoned.', confirm: 'Ban', danger: true })) run('ban', n, `${n} is banned`) }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : <Empty icon={Users} title="Nobody online" />}
      </Panel>

      <Panel title="Access" sub={running ? 'Changes apply right away.' : 'The server is stopped; changes are saved to the files and apply on next start.'}
        actions={<><Seg value={tab} onChange={setTab} options={[{ value: 'whitelist', label: `Whitelist${d ? ` (${d.whitelist.length})` : ''}` }, { value: 'ops', label: `Operators${d ? ` (${d.ops.length})` : ''}` }, { value: 'banned', label: `Banned${d ? ` (${d.banned.length})` : ''}` }]} />
          <Button variant="primary" icon={tab === 'banned' ? Ban : UserPlus} onClick={add}>{tab === 'whitelist' ? 'Add' : tab === 'ops' ? 'Add operator' : 'Ban'}</Button></>}>
        {tab === 'whitelist' && d && (
          <div style={{ marginBottom: 12 }}>
            <ToggleRow title="Whitelist" hint={d.whitelistEnabled ? 'Only players on this list can join.' : 'Anyone who can reach the server can join.'} checked={d.whitelistEnabled}
              onChange={async (v) => { await act(() => api.setWhitelistEnabled(v)); p.reload() }} />
            {!d.whitelistEnabled && <Banner tone="warn">The whitelist is off. Everyone on your Tailscale share can join with any name.</Banner>}
          </div>
        )}
        {p.error && <Banner tone="error">{p.error}</Banner>}
        {d && !list.length && <Empty icon={tab === 'banned' ? Ban : Users} title={tab === 'whitelist' ? 'Nobody whitelisted yet' : tab === 'ops' ? 'No operators' : 'Nobody banned'} />}
        <div className="rows">
          {list.map((e) => (
            <div className="row" key={e.uuid + e.name}><Avatar name={e.name} />
              <div style={{ minWidth: 0 }}><div className="row__title truncate">{e.name}</div><div className="row__meta mono truncate">{tab === 'banned' ? (e.reason || 'Banned') : e.uuid}</div></div>
              <div className="row__actions">
                {tab === 'whitelist' && <ActionButton size="sm" variant="ghost" icon={UserMinus} label="Remove from whitelist" onAction={() => run('whitelist-remove', e.name, `${e.name} removed`)} />}
                {tab === 'ops' && <ActionButton size="sm" variant="ghost" icon={ShieldOff} label="Remove operator" onAction={() => run('deop', e.name, `${e.name} is no longer an operator`)} />}
                {tab === 'banned' && <ActionButton size="sm" variant="ghost" icon={Trash2} label="Pardon" onAction={() => run('pardon', e.name, `${e.name} pardoned`)} />}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
