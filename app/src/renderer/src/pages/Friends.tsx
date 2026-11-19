import { Copy, ExternalLink, FileDown, FolderOpen, Hammer, RefreshCw, Shield, Share2 } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtAgo, useLoad, useStore } from '@/lib/store'
import { ActionButton, Banner, Button, Panel, Progress } from '@/components/ui'
import { LOADER_LABEL } from '@/lib/loaders'

export function FriendsPage() {
  const { settings, progress, act, toast } = useStore()
  const ts = useLoad(() => api.tailscale())
  const kit = useLoad(() => api.friendKit())
  const t = ts.data
  const p = progress.friendkit
  const building = p && !p.finished
  const joinText = t?.ip ? `Join my Minecraft server "${settings?.serverName}":\n1. Install Tailscale (https://tailscale.com/download) and sign in with your own account.\n2. Accept the share invite I send you.\n3. ${settings?.loader === 'neoforge' || settings?.loader === 'forge' ? `Import the modpack I send you into Prism Launcher or the Modrinth App (needed: the server uses ${LOADER_LABEL[settings.loader]} mods)` : 'Run the mod installer I send you (optional)'}, then add the server ${t.ip} in Multiplayer.` : ''

  return (
    <>
      <Panel title="1. Tailscale on this PC" sub="Friends reach your server through Tailscale, so you don't need port forwarding."
        actions={<Button variant="ghost" icon={RefreshCw} label="Check again" onClick={() => ts.reload()} />}>
        {!t ? <Progress value={null} /> : !t.installed ? (
          <Banner tone="error" action={<Button variant="primary" icon={ExternalLink} onClick={() => api.openExternal('https://tailscale.com/download/windows')}>Download</Button>}>Tailscale is not installed.</Banner>
        ) : !t.loggedIn ? (
          <Banner tone="warn">Tailscale is installed but not signed in. Open it from the system tray and sign in.</Banner>
        ) : (
          <div className="cluster cluster--lg">
            <div className="stat"><span className="overline">Server address</span><span className="stat__value mono" style={{ fontSize: 20 }}>{t.ip}</span></div>
            {t.dnsName && <div className="stat"><span className="overline">Name</span><span className="small mono wrap-any">{t.dnsName}</span></div>}
            <Button icon={Copy} onClick={() => act(() => api.copyText(t.ip!), 'Address copied')}>Copy address</Button>
          </div>
        )}
      </Panel>

      <div className="grid">
        <Panel title="2. Share the server" sub="Each friend signs in to Tailscale with their own account. Share only this PC with them.">
          <ol className="small stack" style={{ paddingLeft: 18, margin: 0, gap: 6 }}>
            <li>Open the Tailscale admin console.</li>
            <li>Click <b>…</b> next to this PC ({t?.hostName ?? 'this PC'}), then <b>Share</b>.</li>
            <li>Send each friend their own invite link (each link works once).</li>
            <li>Add their Minecraft name in <b>Players</b>.</li>
          </ol>
          <div className="cluster" style={{ marginTop: 12 }}>
            <Button variant="primary" icon={Share2} onClick={() => api.openExternal('https://login.tailscale.com/admin/machines')}>Open admin console</Button>
            <Button icon={Copy} disabled={!joinText} onClick={() => act(() => api.copyText(joinText), 'Join instructions copied')}>Copy join message</Button>
          </div>
        </Panel>
        <Panel title="3. Firewall" sub="Opens the game, web map and voice chat ports to Tailscale addresses only.">
          {t?.firewallReady ? <Banner tone="ok">Ready. Only Tailscale devices can connect.</Banner> : (
            <div className="stack">
              <span className="small muted">Windows asks for administrator permission once.</span>
              <ActionButton variant="primary" icon={Shield} onAction={async () => { const ok = await act(() => api.setupFirewall()); if (ok === true) toast('success', 'Firewall ready'); else if (ok === false) toast('error', 'The firewall was not changed. Did you allow the administrator prompt?'); ts.reload() }}>Set up firewall</ActionButton>
            </div>
          )}
        </Panel>
      </div>

      <Panel title={kit.data?.kind === 'mrpack' ? '4. Modpack for friends' : '4. One-click mod installer'} sub={kit.data?.kind === 'mrpack'
        ? `A .mrpack modpack friends import into Prism Launcher, the Modrinth App or CurseForge. It has ${LOADER_LABEL[settings?.loader ?? 'neoforge']}, the mods your server needs players to have, and the client mods (minimap, performance, shaders) that have a ${LOADER_LABEL[settings?.loader ?? 'neoforge']} version.`
        : `A .bat file friends double-click. It installs Fabric and ${kit.data?.modCount ?? 'the'} client mods (minimap, performance, shaders, voice chat) for the official launcher${settings?.loader === 'fabric' ? ', plus the server mods players need,' : ''} and adds your server to their list.`}
        actions={<>
          <ActionButton variant="primary" icon={Hammer} disabled={!t?.ip || !!building} onAction={async () => { const k = await act(() => api.buildFriendKit(false), kit.data?.kind === 'mrpack' ? 'Modpack built' : 'Installer built'); if (k) { kit.setData(k); if (k.dir) api.openPath(k.dir) } }}>{kit.data?.kind === 'mrpack' ? 'Build modpack' : 'Build installer'}</ActionButton>
          <ActionButton icon={RefreshCw} disabled={!t?.ip || !!building} onAction={async () => { const k = await act(() => api.buildFriendKit(true), kit.data?.kind === 'mrpack' ? 'Mod list refreshed and modpack built' : 'Mod list refreshed and installer built'); if (k) kit.setData(k) }}>Refresh mod versions</ActionButton>
        </>}>
        {!t?.ip && <Banner tone="warn">Connect Tailscale first: the installer contains your server address.</Banner>}
        {building && <div className="stack"><span className="small muted">{p.label}</span><Progress value={null} /></div>}
        {kit.data?.installer && !building && (
          <div className="cluster">
            <span className="small muted">Built {fmtAgo(kit.data.builtAt!)}.</span>
            <Button icon={FolderOpen} onClick={() => api.openPath(kit.data!.dir)}>Open folder</Button>
            <Button icon={FileDown} onClick={() => api.openPath(kit.data!.installer!)}>{kit.data.kind === 'mrpack' ? 'Show modpack' : 'Show installer'}</Button>
            {kit.data.serverMods > 0 && <span className="tag">{kit.data.serverMods} from your server</span>}
          </div>
        )}
        {kit.data && kit.data.mods.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>What it installs ({kit.data.mods.length})</summary>
            <div className="cluster" style={{ marginTop: 8 }}>{kit.data.mods.map((m) => <span key={m.slug} className="tag" title={`${m.kind} ${m.version}`}>{m.title}</span>)}</div>
          </details>
        )}
      </Panel>
    </>
  )
}
