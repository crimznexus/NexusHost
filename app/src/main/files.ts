import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { FileEntry } from '@shared/types'
import { safeJoin } from './util'

const TEXT = /\.(properties|ya?ml|json|txt|toml|conf|cfg|ini|md|log|sk|mcfunction|mcmeta|csv|bat|sh)$/i
const MAX_EDIT = 2 * 1024 * 1024

export async function listFiles(root: string, rel: string): Promise<FileEntry[]> {
  const d = safeJoin(root, rel)
  const out: FileEntry[] = []
  for (const e of await fsp.readdir(d, { withFileTypes: true })) {
    const full = path.join(d, e.name)
    let st
    try { st = await fsp.stat(full) } catch { continue }
    out.push({ name: e.name, rel: path.relative(root, full).replace(/\\/g, '/'), dir: e.isDirectory(), size: st.size, modified: st.mtimeMs })
  }
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export async function readText(root: string, rel: string): Promise<string> {
  const f = safeJoin(root, rel)
  const st = await fsp.stat(f)
  if (st.size > MAX_EDIT) throw new Error('This file is too large to open here (over 2 MB).')
  if (!TEXT.test(f)) throw new Error('Only text files (configs, logs, json, yml...) can be opened here.')
  return fsp.readFile(f, 'utf8')
}

export async function writeText(root: string, rel: string, content: string) {
  const f = safeJoin(root, rel)
  if (!TEXT.test(f)) throw new Error('Only text files can be edited here.')
  if (existsSync(f)) await fsp.copyFile(f, f + '.bak')
  await fsp.writeFile(f, content, 'utf8')
}

export async function logFiles(root: string): Promise<FileEntry[]> {
  const d = path.join(root, 'logs')
  if (!existsSync(d)) return []
  return (await listFiles(root, 'logs')).filter((f) => !f.dir).sort((a, b) => b.modified - a.modified)
}

export async function readLog(root: string, rel: string): Promise<string> {
  const f = safeJoin(root, rel)
  const buf = await fsp.readFile(f)
  const txt = f.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8')
  return txt.length > 3_000_000 ? txt.slice(-3_000_000) : txt
}
