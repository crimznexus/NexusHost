import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import yauzl from 'yauzl'
import type { Loader, ModrinthHit, PluginInfo } from '@shared/types'
import { contentDir } from './loaders'
import { downloadVerified, getJson, hashFile, readJson, writeJson } from './util'

// Plugins (Paper) and mods (Fabric, NeoForge, Forge) are handled the same way: jars in plugins/ or mods/,
// turned off by moving them to <folder>-disabled/, removed to <folder>-old/.
function folders(loader: Loader) {
  const sub = contentDir(loader)
  if (!sub) throw new Error('Vanilla servers cannot load plugins or mods. Pick Paper, Fabric, NeoForge or Forge.')
  return { on: sub, off: `${sub}-disabled`, old: `${sub}-old` }
}

const MR = 'https://api.modrinth.com/v2'
const TRACK = '.nexushost-plugins.json'
type Track = Record<string, { slug: string; version: string; client?: boolean }> // keyed by jar file name; client: players need the mod too

export async function modrinthVersion(slug: string, mcVersion: string, loaders: string[]): Promise<any | null> {
  const q = `game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}&loaders=${encodeURIComponent(JSON.stringify(loaders))}`
  const vs = await getJson<any[]>(`${MR}/project/${encodeURIComponent(slug)}/version?${q}`)
  if (!vs.length) return null
  return vs.find((v) => v.version_type === 'release') ?? vs[0]
}

export function primaryFile(v: any) { return v.files.find((f: any) => f.primary) ?? v.files[0] }

async function pluginVersion(slug: string, mcVersion: string, loader: Loader) {
  if (loader !== 'paper') return modrinthVersion(slug, mcVersion, [loader])
  return (await modrinthVersion(slug, mcVersion, ['paper'])) ?? (await modrinthVersion(slug, mcVersion, ['bukkit', 'spigot', 'purpur']))
}

async function readTrack(dir: string, loader: Loader): Promise<Track> {
  const pdir = path.join(dir, folders(loader).on)
  const t = await readJson<Track>(path.join(pdir, TRACK), {})
  // the PowerShell setup script tracked plain file names; keep them recognisable
  const legacy = await readJson<string[] | null>(path.join(pdir, '.nexushost.json'), null)
  if (Array.isArray(legacy)) for (const f of legacy) if (!t[f]) t[f] = { slug: '', version: '' }
  return t
}

export async function installPlugin(dir: string, loader: Loader, slug: string, mcVersion: string): Promise<string> {
  const fo = folders(loader)
  const v = await pluginVersion(slug, mcVersion, loader)
  if (!v) throw new Error(`${slug} has no ${loader === 'paper' ? 'plugin' : loader} version for Minecraft ${mcVersion} yet.`)
  const f = primaryFile(v)
  const pdir = path.join(dir, fo.on)
  await fsp.mkdir(pdir, { recursive: true })
  await downloadVerified(f.url, path.join(pdir, f.filename), f.hashes.sha512, 'sha512')
  const t = await readTrack(dir, loader)
  for (const [file, info] of Object.entries(t)) {
    if (info.slug === slug && file !== f.filename) {
      // an older version of the same plugin
      await moveTo(path.join(pdir, file), path.join(dir, fo.old))
      delete t[file]
    }
  }
  const client = loader === 'paper' ? undefined : (await getJson<any>(`${MR}/project/${v.project_id}`).catch(() => null))?.client_side === 'required'
  t[f.filename] = { slug, version: v.version_number, ...(client !== undefined ? { client } : {}) }
  // required library mods (Fabric API, Architectury, ...) come along
  if (loader !== 'paper') for (const d of v.dependencies ?? []) {
    if (d.dependency_type !== 'required' || !d.project_id || Object.values(t).some((x) => x.slug === d.project_id)) continue
    const dep = await getJson<any>(`${MR}/project/${d.project_id}`).catch(() => null)
    if (dep && !Object.values(t).some((x) => x.slug === dep.slug)) { await writeJson(path.join(pdir, TRACK), t); await installPlugin(dir, loader, dep.slug, mcVersion).catch(() => {}); Object.assign(t, await readTrack(dir, loader)) }
  }
  await writeJson(path.join(pdir, TRACK), t)
  return f.filename
}

async function moveTo(file: string, destDir: string) {
  if (!existsSync(file)) return
  await fsp.mkdir(destDir, { recursive: true })
  await fsp.rename(file, path.join(destDir, path.basename(file)))
}

/** name, version, description and authors from plugin.yml, fabric.mod.json or (neo)forge mods.toml. */
function readPluginYml(jar: string): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    yauzl.open(jar, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return resolve({})
      let found = false
      zip.on('entry', (e: yauzl.Entry) => {
        const kind = /^(paper-plugin|plugin)\.yml$/.test(e.fileName) ? 'yml' : e.fileName === 'fabric.mod.json' ? 'fabric' : /^META-INF\/(neoforge\.)?mods\.toml$/.test(e.fileName) ? 'toml' : null
        if (kind) {
          found = true
          zip.openReadStream(e, (er, s) => {
            if (er || !s) { zip.close(); return resolve({}) }
            let txt = ''
            s.on('data', (d) => (txt += d)).on('end', () => { zip.close(); resolve(kind === 'yml' ? parseYamlTop(txt) : kind === 'fabric' ? parseFabric(txt) : parseModsToml(txt)) })
          })
        } else zip.readEntry()
      })
      zip.on('end', () => { if (!found) resolve({}) })
      zip.readEntry()
    })
  })
}

function parseFabric(txt: string): Record<string, any> {
  try {
    const j = JSON.parse(txt.replace(/^\uFEFF/, ''))
    return { name: j.name ?? j.id, version: j.version, description: j.description, authors: (j.authors ?? []).map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean) }
  } catch { return {} }
}

// The first [[mods]] entry; version is often a ${file.jarVersion} placeholder, which the list replaces with the Modrinth version
function parseModsToml(txt: string): Record<string, any> {
  const body = txt.split(/^\s*\[\[mods\]\]\s*$/m)[1] ?? ''
  const get = (k: string) => (new RegExp(`^\\s*${k}\\s*=\\s*(?:'''([\\s\\S]*?)'''|"""([\\s\\S]*?)"""|"([^"]*)"|'([^']*)')`, 'm').exec(body) ?? new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm').exec(txt))?.slice(1).find((x) => x !== undefined)?.trim()
  const version = get('version')
  return { name: get('displayName') ?? get('modId'), version: version && !version.includes('${') ? version : '', description: get('description'), authors: get('authors') ? [get('authors')] : [] }
}

// Only top-level scalar keys and simple lists are needed (name, version, description, author(s)).
function parseYamlTop(txt: string): Record<string, any> {
  const out: Record<string, any> = {}
  let listKey: string | null = null
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (m) {
      listKey = null
      let v = m[2].trim()
      if (!v) { listKey = m[1]; out[m[1]] = []; continue }
      if (v.startsWith('[') && v.endsWith(']')) { out[m[1]] = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')); continue }
      out[m[1]] = v.replace(/^['"]|['"]$/g, '')
    } else if (listKey && /^\s*-\s+/.test(line)) out[listKey].push(line.replace(/^\s*-\s+/, '').replace(/^['"]|['"]$/g, ''))
    else if (!/^\s/.test(line)) listKey = null
  }
  return out
}

export async function listPlugins(dir: string, loader: Loader, mcVersion: string, checkUpdates: boolean): Promise<PluginInfo[]> {
  if (!contentDir(loader)) return []
  const fo = folders(loader)
  const t = await readTrack(dir, loader)
  const out: PluginInfo[] = []
  for (const [sub, enabled] of [[fo.on, true], [fo.off, false]] as const) {
    const pdir = path.join(dir, sub)
    if (!existsSync(pdir)) continue
    for (const f of (await fsp.readdir(pdir)).filter((x) => x.toLowerCase().endsWith('.jar'))) {
      const y = await readPluginYml(path.join(pdir, f))
      out.push({
        file: f, enabled, name: y.name || f.replace(/\.jar$/i, ''), version: String(y.version || t[f]?.version || ''), clientNeeded: t[f]?.client,
        description: String(y.description ?? ''), authors: [].concat(y.authors ?? [], y.author ?? []),
        slug: t[f]?.slug || null, latestVersion: null, updateFile: null
      })
    }
  }
  if (checkUpdates && mcVersion) {
    await Promise.all(out.map(async (p) => {
      let slug = p.slug
      if (!slug) {
        // unknown origin: identify it on Modrinth by file hash
        try {
          const h = await hashFile(path.join(dir, p.enabled ? fo.on : fo.off, p.file), 'sha512')
          const v = await getJson<any>(`${MR}/version_file/${h}?algorithm=sha512`, 1)
          const proj = await getJson<any>(`${MR}/project/${v.project_id}`, 1)
          slug = proj.slug
          t[p.file] = { slug: proj.slug, version: v.version_number, ...(loader !== 'paper' ? { client: proj.client_side === 'required' } : {}) }
          p.slug = slug
          p.clientNeeded = t[p.file].client
        } catch { return }
      }
      try {
        const v = await pluginVersion(slug!, mcVersion, loader)
        if (v) { const f = primaryFile(v); if (f.filename !== p.file) { p.latestVersion = v.version_number; p.updateFile = f.filename } }
      } catch { /* offline */ }
    }))
    await writeJson(path.join(dir, fo.on, TRACK), t).catch(() => {})
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function setPluginEnabled(dir: string, loader: Loader, file: string, enabled: boolean) {
  const fo = folders(loader)
  const from = path.join(dir, enabled ? fo.off : fo.on, path.basename(file))
  await moveTo(from, path.join(dir, enabled ? fo.on : fo.off))
}

export async function removePlugin(dir: string, loader: Loader, file: string) {
  const fo = folders(loader)
  const name = path.basename(file)
  for (const sub of [fo.on, fo.off]) await moveTo(path.join(dir, sub, name), path.join(dir, fo.old))
  const t = await readTrack(dir, loader); delete t[name]; await writeJson(path.join(dir, fo.on, TRACK), t)
}

export async function updatePlugin(dir: string, loader: Loader, file: string, mcVersion: string): Promise<string> {
  const t = await readTrack(dir, loader)
  const slug = t[path.basename(file)]?.slug
  if (!slug) throw new Error('This was not installed from Modrinth, so it cannot be updated automatically.')
  return installPlugin(dir, loader, slug, mcVersion)
}

/** Mods and plugins installed on the server that players also need, with their Modrinth file (for the friends kit). */
export async function clientMods(dir: string, loader: Loader, mcVersion: string): Promise<{ slug: string; title: string; version: string; file: string; url: string; sha1: string; sha512: string; size: number }[]> {
  if (loader === 'paper' || !contentDir(loader)) return []
  const t = await readTrack(dir, loader)
  const out = []
  for (const [file, info] of Object.entries(t)) {
    if (!info.client || !info.slug || !existsSync(path.join(dir, folders(loader).on, file))) continue
    const v = await pluginVersion(info.slug, mcVersion, loader).catch(() => null)
    if (!v) continue
    const f = primaryFile(v)
    const proj = await getJson<any>(`${MR}/project/${v.project_id}`).catch(() => ({ title: info.slug }))
    out.push({ slug: info.slug, title: proj.title, version: v.version_number, file: f.filename, url: f.url, sha1: f.hashes.sha1, sha512: f.hashes.sha512, size: f.size })
  }
  return out
}

export async function searchPlugins(query: string, mcVersion: string, loader: Loader): Promise<ModrinthHit[]> {
  folders(loader)
  const facets = JSON.stringify(loader === 'paper'
    ? [['categories:paper', 'categories:bukkit', 'categories:spigot', 'categories:purpur'], [`versions:${mcVersion}`], ['project_type:plugin']]
    : [[`categories:${loader}`], [`versions:${mcVersion}`], ['project_type:mod'], ['server_side:required', 'server_side:optional']])
  const j = await getJson<{ hits: any[] }>(`${MR}/search?limit=24&index=${query ? 'relevance' : 'downloads'}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`)
  return j.hits.map((h) => ({ slug: h.slug, title: h.title, description: h.description, author: h.author, downloads: h.downloads, icon_url: h.icon_url || null, categories: h.categories ?? [], client_side: h.client_side, server_side: h.server_side }))
}
