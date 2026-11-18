import { existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'

// server.properties uses Java properties escaping. Values we write are simple, but MOTDs can contain
// unicode, so non-ASCII is written as \uXXXX the way the server itself does.
function unescape(v: string): string {
  return v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' } as Record<string, string>)[c] ?? c)
}
function escape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    .replace(/^ /, '\\ ').replace(/[=:]/g, (c) => '\\' + c)
}

export async function readProperties(dir: string): Promise<Record<string, string>> {
  const f = path.join(dir, 'server.properties')
  if (!existsSync(f)) return {}
  const out: Record<string, string> = {}
  for (const raw of (await fsp.readFile(f, 'utf8')).split(/\r?\n/)) {
    const line = raw.trimStart()
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const m = /^((?:\\.|[^=:])*?)\s*[=:]\s*(.*)$/.exec(line)
    if (m) out[unescape(m[1])] = unescape(m[2])
  }
  return out
}

/** Updates keys in place, keeps comments and order, appends new keys. */
export async function writeProperties(dir: string, patch: Record<string, string>): Promise<void> {
  const f = path.join(dir, 'server.properties')
  const lines = existsSync(f) ? (await fsp.readFile(f, 'utf8')).split(/\r?\n/) : ['#Minecraft server properties']
  const left = new Map(Object.entries(patch))
  const out = lines.map((raw) => {
    const m = /^((?:\\.|[^=:#!\s])+)\s*=/.exec(raw)
    if (!m) return raw
    const key = unescape(m[1])
    if (!left.has(key)) return raw
    const v = left.get(key)!
    left.delete(key)
    return `${key}=${escape(v)}`
  })
  while (out.length && out[out.length - 1] === '') out.pop()
  for (const [k, v] of left) out.push(`${k}=${escape(v)}`)
  await fsp.writeFile(f, out.join('\n') + '\n', 'utf8')
}
