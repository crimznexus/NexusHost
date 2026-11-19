// Server software: Paper (plugins), Fabric / NeoForge / Forge (mods) and plain Vanilla.
// Each one knows which Minecraft versions it supports, how to install itself into a server folder,
// and which java arguments start it.
import { existsSync, promises as fsp, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Loader, PaperVersions, SoftwareStatus } from '@shared/types'
import { findPaperJar, installPaper, paperBuilds, paperVersionMeta, paperVersions } from './paper'
import { downloadVerified, getJson, getText, run } from './util'

export const LOADER_LABEL: Record<Loader, string> = { paper: 'Paper', fabric: 'Fabric', neoforge: 'NeoForge', forge: 'Forge', vanilla: 'Vanilla' }
export const LOADERS: Loader[] = ['paper', 'fabric', 'neoforge', 'forge', 'vanilla']

/** The folder the server loads add-ons from, or null for Vanilla. */
export const contentDir = (l: Loader): 'plugins' | 'mods' | null => (l === 'paper' ? 'plugins' : l === 'vanilla' ? null : 'mods')

const FABRIC = 'https://meta.fabricmc.net/v2'
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export function cmpVersion(a: string, b: string): number {
  const x = a.split(/[.\-+]/).map((n) => Number(n) || 0), y = b.split(/[.\-+]/).map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d }
  return 0
}
const newestFirst = (xs: string[]) => [...new Set(xs)].sort((a, b) => cmpVersion(b, a))
const isBeta = (v: string) => /beta|alpha|rc|pre/i.test(v)

// Short-lived caches so the wizard and Software page don't refetch on every render
const cache = new Map<string, { at: number; value: Promise<any> }>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.value
  const value = load().catch((e) => { cache.delete(key); throw e })
  cache.set(key, { at: Date.now(), value })
  return value
}
const mojang = () => cached('mojang', () => getJson<{ versions: { id: string; type: string; url: string }[] }>(MOJANG))
const neoVersions = () => cached('neo', async () => [...(await getText(`${NEO_MAVEN}/maven-metadata.xml`)).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]))
const forgePromos = () => cached('forge', async () => (await getJson<{ promos: Record<string, string> }>(FORGE_PROMOS)).promos)

/** NeoForge 21.1.x is for Minecraft 1.21.1 and 21.0.x for 1.21; from 26.1 on the version starts with the Minecraft version (26.3.0.113 is for 26.3). */
export function neoMc(v: string): string | null {
  const p = v.split('-')[0].split('.')
  if (Number(p[0]) >= 25) return p.length < 4 ? null : p[2] === '0' ? `${p[0]}.${p[1]}` : `${p[0]}.${p[1]}.${p[2]}`
  return p.length < 3 ? null : p[1] === '0' ? `1.${p[0]}` : `1.${p[0]}.${p[1]}`
}

export async function mcVersions(loader: Loader): Promise<PaperVersions> {
  let vs: string[]
  switch (loader) {
    case 'paper': return paperVersions()
    case 'vanilla': vs = (await mojang()).versions.filter((v) => v.type === 'release').map((v) => v.id); break
    case 'fabric': vs = (await getJson<{ version: string; stable: boolean }[]>(`${FABRIC}/versions/game`)).filter((g) => g.stable).map((g) => g.version); break
    case 'neoforge': vs = newestFirst((await neoVersions()).map(neoMc).filter((x): x is string => !!x)); break
    case 'forge': vs = newestFirst(Object.keys(await forgePromos()).map((k) => k.replace(/-(latest|recommended)$/, ''))); break
  }
  if (!vs.length) throw new Error(`${LOADER_LABEL[loader]} lists no Minecraft versions right now.`)
  return { versions: vs, latest: vs[0] }
}

/** Minimum Java and the JVM flags to use. Paper's recommended (Aikar's) flags suit every loader. */
export async function javaRequirement(loader: Loader, mc: string): Promise<{ javaMin: number; flags: string[] }> {
  if (loader === 'paper') return paperVersionMeta(mc)
  const paper = await paperVersionMeta(mc).catch(() => null)
  const entry = (await mojang()).versions.find((v) => v.id === mc)
  const meta = entry ? await getJson<any>(entry.url).catch(() => null) : null
  return { javaMin: Number(meta?.javaVersion?.majorVersion ?? paper?.javaMin ?? 21), flags: paper?.flags ?? [] }
}

/** Newest stable loader version for mc (Paper: build number; Vanilla: mc itself). */
export async function latestLoader(loader: Loader, mc: string): Promise<string | null> {
  const builds = (await software(loader, mc)).builds
  return (builds.find((b) => b.channel === 'STABLE' || b.channel === 'RECOMMENDED') ?? builds[0])?.id ?? null
}

export async function software(loader: Loader, mc: string): Promise<SoftwareStatus> {
  let builds: SoftwareStatus['builds'] = []
  switch (loader) {
    case 'paper': builds = (await paperBuilds(mc)).slice(0, 15).map((b) => ({ id: String(b.id), channel: b.channel, time: b.time })); break
    case 'vanilla': builds = (await mojang()).versions.some((v) => v.id === mc) ? [{ id: mc, channel: 'STABLE', time: null }] : []; break
    case 'fabric': builds = (await getJson<any[]>(`${FABRIC}/versions/loader/${encodeURIComponent(mc)}`).catch(() => [])).slice(0, 15)
      .map((l) => ({ id: l.loader.version, channel: l.loader.stable ? 'STABLE' : 'BETA', time: null })); break
    case 'neoforge': builds = newestFirst((await neoVersions()).filter((v) => neoMc(v) === mc)).slice(0, 15)
      .map((v) => ({ id: v, channel: isBeta(v) ? 'BETA' : 'STABLE', time: null })); break
    case 'forge': {
      const p = await forgePromos()
      const rec = p[`${mc}-recommended`], lat = p[`${mc}-latest`]
      if (rec) builds.push({ id: rec, channel: 'RECOMMENDED', time: null })
      if (lat && lat !== rec) builds.push({ id: lat, channel: 'LATEST', time: null })
      break
    }
  }
  const latest = (builds.find((b) => b.channel === 'STABLE' || b.channel === 'RECOMMENDED') ?? builds[0])?.id ?? null
  return { loader, mcVersion: mc, latest, builds }
}

async function retire(dir: string, re: RegExp, keep: string) {
  const old = readdirSync(dir).filter((f) => re.test(f) && f !== keep)
  if (!old.length) return
  await fsp.mkdir(path.join(dir, 'old-jars'), { recursive: true })
  for (const f of old) await fsp.rename(path.join(dir, f), path.join(dir, 'old-jars', f)).catch(() => {})
}

type Progress = (label: string, done?: number, total?: number) => void
const mb = (d: number, t: number) => `${Math.round(d / 1048576)} / ${Math.round(t / 1048576)} MB`

/** Installs (or updates) the server software for mc into dir. Returns the installed build / loader version. */
export async function installLoader(dir: string, loader: Loader, mc: string, javaPath: string, onProgress: Progress): Promise<string> {
  await fsp.mkdir(dir, { recursive: true })
  const name = LOADER_LABEL[loader]
  switch (loader) {
    case 'paper': {
      const r = await installPaper(dir, mc, (d, t) => onProgress(`Downloading Paper ${mc} (${mb(d, t)})`, d, t))
      return String(r.build)
    }
    case 'vanilla': {
      const entry = (await mojang()).versions.find((v) => v.id === mc)
      if (!entry) throw new Error(`Minecraft ${mc} was not found.`)
      const s = (await getJson<any>(entry.url)).downloads?.server
      if (!s?.url || !s?.sha1) throw new Error(`Mojang has no server download for ${mc}.`)
      const jar = `minecraft_server.${mc}.jar`
      await downloadVerified(s.url, path.join(dir, jar), s.sha1, 'sha1', (d, t) => onProgress(`Downloading Minecraft ${mc} (${mb(d, t)})`, d, t))
      await retire(dir, /^minecraft_server\..+\.jar$/i, jar)
      return mc
    }
    case 'fabric': {
      const lv = await latestLoader('fabric', mc)
      if (!lv) throw new Error(`Fabric does not support Minecraft ${mc} yet.`)
      const inst = await getJson<{ version: string; stable: boolean }[]>(`${FABRIC}/versions/installer`)
      const iv = (inst.find((i) => i.stable) ?? inst[0]).version
      const jar = `fabric-server-mc.${mc}-loader.${lv}-launcher.${iv}.jar`
      await downloadVerified(`${FABRIC}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(lv)}/${encodeURIComponent(iv)}/server/jar`,
        path.join(dir, jar), null, 'sha1', (d, t) => onProgress(`Downloading Fabric ${lv} (${mb(d, t)})`, d, t))
      await retire(dir, /^fabric-server-.*\.jar$/i, jar)
      return lv
    }
    case 'neoforge':
    case 'forge': {
      const v = await latestLoader(loader, mc)
      if (!v) throw new Error(`${name} does not support Minecraft ${mc} yet.`)
      const url = loader === 'neoforge' ? `${NEO_MAVEN}/${v}/neoforge-${v}-installer.jar` : `${FORGE_MAVEN}/${mc}-${v}/forge-${mc}-${v}-installer.jar`
      const sha1 = (await getText(url + '.sha1')).trim().split(/\s+/)[0]
      if (!/^[0-9a-f]{40}$/i.test(sha1)) throw new Error(`Could not get a checksum for the ${name} installer.`)
      const inst = path.join(dir, path.basename(url))
      await downloadVerified(url, inst, sha1, 'sha1', (d, t) => onProgress(`Downloading the ${name} ${v} installer (${mb(d, t)})`, d, t))
      onProgress(`Installing ${name} ${v}. It downloads Minecraft and its libraries, which takes a few minutes.`)
      const r = await run(javaPath, ['-jar', path.basename(url), '--installServer'], { cwd: dir, timeoutMs: 20 * 60000 })
      if (r.code !== 0 || !launchArgs(dir, loader)) {
        const tail = (r.stdout + '\n' + r.stderr).trim().split(/\r?\n/).filter(Boolean).slice(-5).join('\n')
        throw new Error(`The ${name} installer failed (exit code ${r.code}).${tail ? '\n' + tail : ''}`)
      }
      await fsp.rm(inst, { force: true })
      await fsp.rm(inst + '.log', { force: true })
      return v
    }
  }
}

const newestByTime = (dir: string, files: string[]) =>
  files.map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.f ?? null

function argsFile(dir: string, loader: 'neoforge' | 'forge'): string | null {
  const base = loader === 'neoforge' ? 'libraries/net/neoforged/neoforge' : 'libraries/net/minecraftforge/forge'
  const bat = path.join(dir, 'run.bat')
  if (existsSync(bat)) {
    const m = /@(libraries[\\/][^\s"]*win_args\.txt)/.exec(readFileSync(bat, 'utf8'))
    const rel = m?.[1].replace(/\\/g, '/')
    if (rel?.startsWith(base + '/') && existsSync(path.join(dir, rel))) return rel
  }
  if (!existsSync(path.join(dir, base))) return null
  const vs = newestFirst(readdirSync(path.join(dir, base)).filter((v) => existsSync(path.join(dir, base, v, 'win_args.txt'))))
  return vs.length ? `${base}/${vs[0]}/win_args.txt` : null
}

/** The java arguments (after memory and flags) that start the server, or null if the software is not installed. */
export function launchArgs(dir: string, loader: Loader): { args: string[]; label: string } | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
  const jar = (j: string | null, extra = 'nogui') => (j ? { args: ['-jar', j, extra], label: j } : null)
  switch (loader) {
    case 'paper': return jar(findPaperJar(dir)?.jar ?? null, '--nogui')
    case 'vanilla': return jar(newestByTime(dir, files.filter((f) => /^minecraft_server\..+\.jar$/i.test(f))) ?? (files.includes('server.jar') ? 'server.jar' : null))
    case 'fabric': return jar(newestByTime(dir, files.filter((f) => /^fabric-server.*\.jar$/i.test(f))))
    case 'neoforge':
    case 'forge': {
      const a = argsFile(dir, loader)
      if (a) return { args: ['@' + a, 'nogui'], label: `${LOADER_LABEL[loader]} (${a.split('/').slice(-2, -1)[0]})` }
      // Forge before 1.17 shipped a runnable jar instead of an argument file
      if (loader === 'forge') return jar(newestByTime(dir, files.filter((f) => /^forge-.+\.jar$/i.test(f) && !/installer/i.test(f))))
      return null
    }
  }
}

/** Works out which server software a folder has, and for which Minecraft version. */
export function detectLoader(dir: string): { loader: Loader; mcVersion: string | null; loaderVersion: string | null; label: string } | null {
  if (!existsSync(dir)) return null
  for (const loader of ['paper', 'neoforge', 'forge', 'fabric', 'vanilla'] as Loader[]) {
    const l = launchArgs(dir, loader)
    if (!l) continue
    let mc: string | null = null, lv: string | null = null
    if (loader === 'paper') { const p = findPaperJar(dir)!; mc = p.version; lv = p.build !== null ? String(p.build) : null }
    else if (loader === 'neoforge' || loader === 'forge') {
      const ver = argsFile(dir, loader)?.split('/').slice(-2, -1)[0] ?? /^forge-(.+)\.jar$/i.exec(l.label)?.[1].replace(/-(universal|shim)$/i, '') ?? null
      if (ver && loader === 'neoforge') { lv = ver; mc = neoMc(ver) }
      else if (ver) { const i = ver.indexOf('-'); mc = i > 0 ? ver.slice(0, i) : null; lv = i > 0 ? ver.slice(i + 1) : ver }
    } else if (loader === 'fabric') {
      const m = /^fabric-server-mc\.(.+)-loader\.(.+)-launcher\.(.+)\.jar$/i.exec(l.label)
      if (m) { mc = m[1]; lv = m[2] }
    } else {
      const m = /^minecraft_server\.(.+)\.jar$/i.exec(l.label)
      if (m) { mc = m[1]; lv = m[1] }
    }
    return { loader, mcVersion: mc, loaderVersion: lv, label: l.label }
  }
  return null
}
