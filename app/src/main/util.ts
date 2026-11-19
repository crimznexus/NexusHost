import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'

export const UA = `NexusHost/${app.getVersion()} (+https://github.com/crimznexus/NexusHost)`

export async function getJson<T = any>(url: string, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (r.status === 404) throw Object.assign(new Error(`Not found: ${url}`), { notFound: true })
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
      return (await r.json()) as T
    } catch (e: any) {
      last = e
      if (e?.notFound) throw e
      await sleep(1500 * (i + 1))
    }
  }
  throw last
}

export async function getText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

export async function hashFile(file: string, algo: 'sha256' | 'sha512' | 'sha1'): Promise<string> {
  const h = createHash(algo)
  await pipeline(createReadStream(file), h)
  return h.digest('hex')
}

const DOWNLOAD_HOSTS = ['fill-data.papermc.io', 'cdn.modrinth.com', 'meta.fabricmc.net', 'api.papermc.io', 'fill.papermc.io',
  'piston-data.mojang.com', 'piston-meta.mojang.com', 'maven.neoforged.net', 'maven.minecraftforge.net']

/** Downloads url to dest unless dest already has the expected hash (or, with hash null, unless dest exists). Returns true if it downloaded. */
export async function downloadVerified(url: string, dest: string, hash: string | null, algo: 'sha1' | 'sha256' | 'sha512',
  onProgress?: (done: number, total: number) => void): Promise<boolean> {
  if (existsSync(dest) && (hash === null || (await hashFile(dest, algo)) === hash.toLowerCase())) return false
  const host = new URL(url).hostname
  if (!DOWNLOAD_HOSTS.includes(host)) throw new Error(`Refusing to download from ${host}`)
  // Only Fabric's generated launcher jar comes without a published hash; it is served over HTTPS from Fabric's own API.
  if (hash === null && host !== 'meta.fabricmc.net') throw new Error(`No checksum for ${url}`)
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}): ${url}`)
  const total = Number(r.headers.get('content-length') ?? 0)
  let done = 0
  const tmp = dest + '.part'
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const body = Readable.fromWeb(r.body as any)
  body.on('data', (c: Buffer) => { done += c.length; onProgress?.(done, total) })
  await pipeline(body, createWriteStream(tmp))
  if (hash !== null && (await hashFile(tmp, algo)) !== hash.toLowerCase()) {
    await fsp.rm(tmp, { force: true })
    throw new Error(`Checksum mismatch for ${path.basename(dest)}`)
  }
  await fsp.rename(tmp, dest)
  return true
}

export function offlineUuid(name: string): string {
  const b = createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest()
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function mojangUuid(name: string): Promise<{ uuid: string; name: string } | null> {
  try {
    const j = await getJson<{ id: string; name: string }>(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`, 2)
    const h = j.id
    return { uuid: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, name: j.name }
  } catch { return null }
}

/** True if something accepts TCP connections on localhost:port. */
export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port })
    const done = (v: boolean) => { s.destroy(); resolve(v) }
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    s.setTimeout(800, () => done(false))
  })
}

export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true })
    let stdout = '', stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    const t = opts.timeoutMs ? setTimeout(() => p.kill(), opts.timeoutMs) : null
    p.on('error', (e) => { if (t) clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e) }) })
    p.on('close', (code) => { if (t) clearTimeout(t); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: import('node:fs').Dirent[]
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else { try { total += (await fsp.stat(p)).size } catch { /* gone */ } }
  }
  return total
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')) as T } catch { return fallback }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

/** Resolves rel inside root; throws if it escapes root. */
export function safeJoin(root: string, rel: string): string {
  const full = path.resolve(root, rel || '.')
  const r = path.resolve(root)
  if (full !== r && !full.startsWith(r + path.sep)) throw new Error('Path is outside the server folder')
  return full
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

/** Path to a bundled resource: app/resources in dev, <install>/resources/resources when packaged. */
export function resourcePath(...parts: string[]): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'resources', ...parts)
  // development: app/out/main -> app -> repo root
  let appDir = __dirname
  while (!existsSync(path.join(appDir, 'package.json')) && path.dirname(appDir) !== appDir) appDir = path.dirname(appDir)
  const dev = path.join(appDir, 'resources', ...parts)
  if (existsSync(dev)) return dev
  // scripts and mods live at the repo root during development
  const map: Record<string, string> = {
    'installer-template.ps1': '../scripts/installer-template.ps1',
    'firewall.ps1': '../scripts/firewall.ps1',
    'make-icon.ps1': '../scripts/make-icon.ps1',
    mods: '../mods'
  }
  const mapped = map[parts[0]]
  if (mapped) return path.join(appDir, mapped, ...parts.slice(1))
  return dev
}
