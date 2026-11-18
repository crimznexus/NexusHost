import { promises as fsp, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { PaperVersions } from '@shared/types'
import { downloadVerified, getJson } from './util'

const API = 'https://fill.papermc.io/v3/projects/paper'

export async function paperVersions(): Promise<PaperVersions> {
  const j = await getJson<{ versions: Record<string, string[]> }>(API)
  const all = Object.values(j.versions).flat()
  const releases = all.filter((v) => !/-(rc|pre)|snapshot/i.test(v))
  return { versions: releases, latest: releases[0] }
}

export interface PaperVersionMeta { javaMin: number; flags: string[] }
export async function paperVersionMeta(version: string): Promise<PaperVersionMeta> {
  const j = await getJson<any>(`${API}/versions/${encodeURIComponent(version)}`)
  return { javaMin: Number(j.version?.java?.version?.minimum ?? 21), flags: j.version?.java?.flags?.recommended ?? [] }
}

export interface PaperBuild { id: number; channel: string; time: string; downloads: Record<string, { name: string; url: string; checksums: { sha256: string } }> }
export async function paperBuilds(version: string): Promise<PaperBuild[]> {
  return getJson<PaperBuild[]>(`${API}/versions/${encodeURIComponent(version)}/builds`)
}

/** Downloads the newest stable build (or newest build if none is stable). Old paper jars move to old-jars/. */
export async function installPaper(dir: string, version: string, onProgress?: (d: number, t: number) => void): Promise<{ build: number; jar: string }> {
  const builds = await paperBuilds(version)
  if (!builds.length) throw new Error(`Paper has no builds for ${version}`)
  const b = builds.find((x) => x.channel === 'STABLE') ?? builds[0]
  const dl = b.downloads['server:default']
  await fsp.mkdir(dir, { recursive: true })
  await downloadVerified(dl.url, path.join(dir, dl.name), dl.checksums.sha256, 'sha256', onProgress)
  const old = readdirSync(dir).filter((f) => /^paper-.*\.jar$/i.test(f) && f !== dl.name)
  if (old.length) {
    await fsp.mkdir(path.join(dir, 'old-jars'), { recursive: true })
    for (const f of old) await fsp.rename(path.join(dir, f), path.join(dir, 'old-jars', f)).catch(() => {})
  }
  return { build: b.id, jar: dl.name }
}

/** Newest paper-*.jar in the folder, with version and build parsed from its name. */
export function findPaperJar(dir: string): { jar: string; version: string | null; build: number | null } | null {
  if (!existsSync(dir)) return null
  const jars = readdirSync(dir).filter((f) => /^paper.*\.jar$/i.test(f))
  if (!jars.length) return null
  const parsed = jars.map((j) => {
    const m = /^paper-(.+)-(\d+)\.jar$/i.exec(j)
    return { jar: j, version: m ? m[1] : null, build: m ? Number(m[2]) : null }
  })
  parsed.sort((a, b) => (b.build ?? 0) - (a.build ?? 0))
  return parsed[0]
}
