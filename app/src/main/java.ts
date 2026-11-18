import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { JavaInfo } from '@shared/types'
import { run } from './util'

export async function javaMajor(exe: string): Promise<number> {
  const r = await run(exe, ['-version'], { timeoutMs: 15000 })
  const out = r.stderr + r.stdout
  let m = /version "1\.(\d+)/.exec(out)
  if (m) return Number(m[1])
  m = /version "(\d+)/.exec(out)
  return m ? Number(m[1]) : 0
}

export async function findJava(minimum: number): Promise<JavaInfo | null> {
  const cands = new Set<string>()
  if (process.env.JAVA_HOME) cands.add(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  for (const root of ['Eclipse Adoptium', 'Microsoft', 'Java', 'Zulu', 'Amazon Corretto', 'BellSoft']) {
    const dir = path.join(pf, root)
    if (!existsSync(dir)) continue
    for (const d of readdirSync(dir)) cands.add(path.join(dir, d, 'bin', 'java.exe'))
  }
  const where = await run('where.exe', ['java'], { timeoutMs: 5000 })
  for (const l of where.stdout.split(/\r?\n/)) if (l.trim()) cands.add(l.trim())
  let best: JavaInfo | null = null
  for (const c of cands) {
    if (!existsSync(c)) continue
    const major = await javaMajor(c)
    if (major >= minimum && (!best || major > best.major)) best = { path: c, major }
  }
  return best
}

/** Opens a console window running winget so the user sees its progress and any UAC prompt. */
export function installJava(major: number): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn('cmd.exe', ['/c', 'start', '"Install Java"', '/wait', 'cmd', '/c',
      `winget install --id EclipseAdoptium.Temurin.${major}.JDK -e --accept-source-agreements & pause`],
    { windowsHide: false, detached: false })
    p.on('close', () => resolve())
    p.on('error', () => resolve())
  })
}
