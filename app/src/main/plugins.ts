import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import yauzl from 'yauzl'
import type { ModrinthHit, PluginInfo } from '@shared/types'
import { downloadVerified, getJson, hashFile, readJson, writeJson } from './util'

const MR = 'https://api.modrinth.com/v2'
const TRACK = '.nexushost-plugins.json'
type Track = Record<string, { slug: string; version: string }> // keyed by jar file name

export async function modrinthVersion(slug: string, mcVersion: string, loaders: string[]): Promise<any | null> {
  const q = `game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}&loaders=${encodeURIComponent(JSON.stringify(loaders))}`
  const vs = await getJson<any[]>(`${MR}/project/${encodeURIComponent(slug)}/version?${q}`)
  if (!vs.length) return null
  return vs.find((v) => v.version_type === 'release') ?? vs[0]
}

export function primaryFile(v: any) { return v.files.find((f: any) => f.primary) ?? v.files[0] }

async function pluginVersion(slug: string, mcVersion: string) {
  return (await modrinthVersion(slug, mcVersion, ['paper'])) ?? (await modrinthVersion(slug, mcVersion, ['bukkit', 'spigot', 'purpur']))
}

async function readTrack(dir: string): Promise<Track> {
  const pdir = path.join(dir, 'plugins')
  const t = await readJson<Track>(path.join(pdir, TRACK), {})
  // the PowerShell setup script tracked plain file names; keep them recognisable
  const legacy = await readJson<string[] | null>(path.join(pdir, '.nexushost.json'), null)
  if (Array.isArray(legacy)) for (const f of legacy) if (!t[f]) t[f] = { slug: '', version: '' }
  return t
}

export async function installPlugin(dir: string, slug: string, mcVersion: string): Promise<string> {
  const v = await pluginVersion(slug, mcVersion)
  if (!v) throw new Error(`${slug} has no version for Minecraft ${mcVersion} yet.`)
  const f = primaryFile(v)
  const pdir = path.join(dir, 'plugins')
  await fsp.mkdir(pdir, { recursive: true })
  await downloadVerified(f.url, path.join(pdir, f.filename), f.hashes.sha512, 'sha512')
  const t = await readTrack(dir)
  for (const [file, info] of Object.entries(t)) {
    if (info.slug === slug && file !== f.filename) {
      // an older version of the same plugin
      await moveTo(path.join(pdir, file), path.join(dir, 'plugins-old'))
      delete t[file]
    }
  }
  t[f.filename] = { slug, version: v.version_number }
  await writeJson(path.join(pdir, TRACK), t)
  return f.filename
}

async function moveTo(file: string, destDir: string) {
  if (!existsSync(file)) return
  await fsp.mkdir(destDir, { recursive: true })
  await fsp.rename(file, path.join(destDir, path.basename(file)))
}

function readPluginYml(jar: string): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    yauzl.open(jar, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return resolve({})
      let found = false
      zip.on('entry', (e: yauzl.Entry) => {
        if (/^(paper-plugin|plugin)\.yml$/.test(e.fileName)) {
          found = true
          zip.openReadStream(e, (er, s) => {
            if (er || !s) { zip.close(); return resolve({}) }
            let txt = ''
            s.on('data', (d) => (txt += d)).on('end', () => { zip.close(); resolve(parseYamlTop(txt)) })
          })
        } else zip.readEntry()
      })
      zip.on('end', () => { if (!found) resolve({}) })
      zip.readEntry()
    })
  })
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

export async function listPlugins(dir: string, mcVersion: string, checkUpdates: boolean): Promise<PluginInfo[]> {
  const t = await readTrack(dir)
  const out: PluginInfo[] = []
  for (const [sub, enabled] of [['plugins', true], ['plugins-disabled', false]] as const) {
    const pdir = path.join(dir, sub)
    if (!existsSync(pdir)) continue
    for (const f of (await fsp.readdir(pdir)).filter((x) => x.toLowerCase().endsWith('.jar'))) {
      const y = await readPluginYml(path.join(pdir, f))
      out.push({
        file: f, enabled, name: y.name || f.replace(/\.jar$/i, ''), version: String(y.version ?? ''),
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
          const h = await hashFile(path.join(dir, p.enabled ? 'plugins' : 'plugins-disabled', p.file), 'sha512')
          const v = await getJson<any>(`${MR}/version_file/${h}?algorithm=sha512`, 1)
          const proj = await getJson<any>(`${MR}/project/${v.project_id}`, 1)
          slug = proj.slug
          t[p.file] = { slug: proj.slug, version: v.version_number }
          p.slug = slug
        } catch { return }
      }
      try {
        const v = await pluginVersion(slug!, mcVersion)
        if (v) { const f = primaryFile(v); if (f.filename !== p.file) { p.latestVersion = v.version_number; p.updateFile = f.filename } }
      } catch { /* offline */ }
    }))
    await writeJson(path.join(dir, 'plugins', TRACK), t).catch(() => {})
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function setPluginEnabled(dir: string, file: string, enabled: boolean) {
  const from = path.join(dir, enabled ? 'plugins-disabled' : 'plugins', path.basename(file))
  await moveTo(from, path.join(dir, enabled ? 'plugins' : 'plugins-disabled'))
}

export async function removePlugin(dir: string, file: string) {
  const name = path.basename(file)
  for (const sub of ['plugins', 'plugins-disabled']) await moveTo(path.join(dir, sub, name), path.join(dir, 'plugins-old'))
  const t = await readTrack(dir); delete t[name]; await writeJson(path.join(dir, 'plugins', TRACK), t)
}

export async function updatePlugin(dir: string, file: string, mcVersion: string): Promise<string> {
  const t = await readTrack(dir)
  const slug = t[path.basename(file)]?.slug
  if (!slug) throw new Error('This plugin was not installed from Modrinth, so it cannot be updated automatically.')
  return installPlugin(dir, slug, mcVersion)
}

export async function searchPlugins(query: string, mcVersion: string): Promise<ModrinthHit[]> {
  const facets = JSON.stringify([['categories:paper', 'categories:bukkit', 'categories:spigot', 'categories:purpur'], [`versions:${mcVersion}`], ['project_type:plugin']])
  const j = await getJson<{ hits: any[] }>(`${MR}/search?limit=24&index=${query ? 'relevance' : 'downloads'}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`)
  return j.hits.map((h) => ({ slug: h.slug, title: h.title, description: h.description, author: h.author, downloads: h.downloads, icon_url: h.icon_url || null, categories: h.categories ?? [] }))
}
