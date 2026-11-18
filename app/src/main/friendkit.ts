import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { FriendKitInfo } from '@shared/types'
import { getJson, getText, readJson, resourcePath, writeJson } from './util'
import { modrinthVersion, primaryFile } from './plugins'
import { readProperties } from './properties'

interface LockEntry { slug: string; title: string; kind: string; version: string; file: string; url: string; sha512: string }

const kitDir = () => path.join(app.getPath('userData'), 'friend-kit')
const lockFile = () => path.join(app.getPath('userData'), 'client-mods.lock.json')
const listFile = () => resourcePath('mods', 'client-mods.txt')

function wantedList(txt: string) {
  return txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean).map((l) => {
    const [slug, kind] = l.split(/\s+/)
    if (!['mod', 'shader', 'resourcepack'].includes(kind)) throw new Error(`Bad line in client-mods.txt: ${l}`)
    return { slug, kind }
  })
}

/** Resolves the client mod list to exact Modrinth versions for mcVersion, following required dependencies. */
export async function resolveMods(mcVersion: string, onProgress?: (label: string) => void): Promise<{ lock: LockEntry[]; missing: string[] }> {
  const wanted = wantedList(await fsp.readFile(listFile(), 'utf8'))
  const loaderFor: Record<string, string[]> = { mod: ['fabric'], shader: ['iris'], resourcepack: ['minecraft'] }
  const queue = wanted.map((w) => ({ ref: w.slug, kind: w.kind }))
  const seen = new Set<string>(), lock: LockEntry[] = [], missing: string[] = []
  while (queue.length) {
    const q = queue.shift()!
    onProgress?.(q.ref)
    const v = await modrinthVersion(q.ref, mcVersion, loaderFor[q.kind]).catch(() => null)
    if (!v) { missing.push(q.ref); continue }
    if (seen.has(v.project_id)) continue
    seen.add(v.project_id)
    const proj = await getJson<any>(`https://api.modrinth.com/v2/project/${v.project_id}`)
    const f = primaryFile(v)
    lock.push({ slug: proj.slug, title: proj.title, kind: q.kind, version: v.version_number, file: f.filename, url: f.url, sha512: f.hashes.sha512 })
    for (const d of v.dependencies ?? []) if (d.dependency_type === 'required' && d.project_id && !seen.has(d.project_id)) queue.push({ ref: d.project_id, kind: 'mod' })
  }
  return { lock, missing }
}

async function currentLock(mcVersion: string): Promise<LockEntry[] | null> {
  const own = await readJson<{ mcVersion: string; lock: LockEntry[] } | null>(lockFile(), null)
  if (own && own.mcVersion === mcVersion) return own.lock
  // the repo ships a lock for the version it was tested with
  const bundled = await readJson<LockEntry[] | null>(resourcePath('mods', 'client-mods.lock.json'), null)
  if (bundled && mcVersion === '26.3') return bundled
  return null
}

export async function friendKitInfo(mcVersion: string): Promise<FriendKitInfo> {
  const dir = kitDir()
  const files = existsSync(dir) ? await fsp.readdir(dir) : []
  const installer = files.find((f) => f.endsWith('.bat')) ?? null
  const lock = (await currentLock(mcVersion)) ?? []
  const st = installer ? await fsp.stat(path.join(dir, installer)) : null
  return {
    dir, installer: installer ? path.join(dir, installer) : null,
    guide: files.includes('FRIENDS-GUIDE.md') ? path.join(dir, 'FRIENDS-GUIDE.md') : null,
    builtAt: st?.mtimeMs ?? null, modCount: lock.length,
    mods: lock.map((m) => ({ slug: m.slug, title: m.title, kind: m.kind, version: m.version }))
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function buildFriendKit(o: { serverDir: string; serverName: string; mcVersion: string; dataVersion: number; host: string; refresh: boolean; onProgress?: (l: string) => void }): Promise<FriendKitInfo> {
  if (!/^[A-Za-z0-9.\-:]+$/.test(o.host)) throw new Error('No valid Tailscale address. Sign in to Tailscale first.')
  const name = o.serverName.replace(/[^\x20-\x7e]|['|"%`]/g, '').trim() || 'Friends Server'
  let lock = o.refresh ? null : await currentLock(o.mcVersion)
  if (!lock) {
    const r = await resolveMods(o.mcVersion, (l) => o.onProgress?.(`Checking ${l}`))
    lock = r.lock
    await writeJson(lockFile(), { mcVersion: o.mcVersion, lock })
  }
  o.onProgress?.('Fetching Fabric loader')
  const loaders = await getJson<any[]>(`https://meta.fabricmc.net/v2/versions/loader/${o.mcVersion}`)
  const loader = loaders.find((l) => l.loader.stable)?.loader.version
  if (!loader) throw new Error(`No stable Fabric loader for Minecraft ${o.mcVersion} yet.`)
  const profile = await getText(`https://meta.fabricmc.net/v2/versions/loader/${o.mcVersion}/${loader}/profile/json`)
  if (JSON.parse(profile).id !== `fabric-loader-${loader}-${o.mcVersion}`) throw new Error('Unexpected Fabric profile response.')

  const listed = wantedList(await fsp.readFile(listFile(), 'utf8')).map((w) => w.slug)
  const order: Record<string, number> = { mod: 0, shader: 1, resourcepack: 2 }
  const idx = (s: string) => { const i = listed.indexOf(s); return i < 0 ? 999 : i }
  const sorted = [...lock].sort((a, b) => order[a.kind] - order[b.kind] || idx(a.slug) - idx(b.slug) || a.title.localeCompare(b.title))
  const manifest = sorted.map((m) => {
    const t = m.title.replace(/[^\x20-\x7e]/g, '').trim()
    for (const v of [t, m.file, m.url]) if (/[|\r\n]/.test(v) || v.includes("'@")) throw new Error(`Unsafe value in mod list: ${v}`)
    if (!m.url.startsWith('https://cdn.modrinth.com/')) throw new Error(`Unexpected download host: ${m.url}`)
    if (!/^[0-9a-f]{128}$/.test(m.sha512)) throw new Error(`Bad hash for ${m.slug}`)
    return [m.kind, t, m.file, m.url, m.sha512].join('|')
  }).join('\r\n')

  const tpl = await fsp.readFile(resourcePath('installer-template.ps1'), 'utf8')
  const ps = tpl.replaceAll('__SERVER_NAME__', name).replaceAll('__SERVER_IP__', o.host).replaceAll('__PROFILE_KEY__', slugify(name))
    .replaceAll('__MC_VERSION__', o.mcVersion).replaceAll('__LOADER__', loader).replaceAll('__DATA_VERSION__', String(o.dataVersion))
    .replaceAll('__FABRIC_PROFILE_B64__', Buffer.from(profile, 'utf8').toString('base64')).replaceAll('__MANIFEST__', manifest)
  if (/[^\x00-\x7f]/.test(ps)) throw new Error('Installer must be plain ASCII.')
  const header = [
    '<# : batch part - runs the PowerShell below. Keep this file as plain ASCII.', '@echo off', `title ${name} - mod installer`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; Invoke-Expression ([IO.File]::ReadAllText($f))"`,
    'echo.', 'pause', 'exit /b', '#>'
  ].join('\r\n')
  const dir = kitDir()
  await fsp.rm(dir, { recursive: true, force: true })
  await fsp.mkdir(dir, { recursive: true })
  const bat = path.join(dir, `Install-${name.replace(/[^A-Za-z0-9]/g, '')}-Mods.bat`)
  await fsp.writeFile(bat, (header + '\r\n' + ps).replace(/\r?\n/g, '\r\n'), 'ascii')

  const props = await readProperties(o.serverDir)
  const offline = props['online-mode'] === 'false'
  const guide = [
    `# ${name}: how to join`, '',
    `Minecraft **Java Edition ${o.mcVersion}**. The server runs on the host's PC and you reach it through Tailscale.`, '',
    `Server address: **${o.host}**`, '',
    '## 1. Get onto the private network (once)', '',
    '1. Install Tailscale: https://tailscale.com/download',
    '2. Sign in with **your own** Google, Microsoft or GitHub account (free).',
    '3. Open the **share invite link** the host sent you and accept it.',
    '4. Send the host your exact Minecraft name so they can whitelist you.', '',
    '## 2. Install the mods (one click, official launcher only)', '',
    '1. Close Minecraft and the Minecraft Launcher completely.',
    `2. Double-click **${path.basename(bat)}**. If Windows warns you, click **More info > Run anyway**.`,
    `3. Open the launcher, pick **${name} (Fabric ${o.mcVersion})** next to Play, and press Play.`, '',
    'Keys: **K** shaders on/off, **M** world map, **C** zoom, **V** voice chat.', '',
    ...(offline ? ['## TLauncher players', '', `Pick version ${o.mcVersion} and add the server address in Multiplayer. Always use the same name with the same capitals: \`Steve\` and \`steve\` are different players.`, ''] : []),
    '## Can\'t connect?', '',
    '- Is Tailscale connected?', '- Did the host whitelist your exact name?', `- Are you on Minecraft ${o.mcVersion}?`
  ].join('\n')
  await fsp.writeFile(path.join(dir, 'FRIENDS-GUIDE.md'), guide, 'utf8')
  return friendKitInfo(o.mcVersion)
}
