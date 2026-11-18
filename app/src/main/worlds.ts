import { createWriteStream, existsSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { ZipArchive } from 'archiver'
import yauzl from 'yauzl'
import { shell } from 'electron'
import type { BackupInfo, WorldInfo } from '@shared/types'
import { readProperties, writeProperties } from './properties'
import { dirSize, stamp } from './util'
import type { ServerManager } from './server'

export async function worldFolders(dir: string): Promise<string[]> {
  const level = (await readProperties(dir))['level-name'] || 'world'
  return [level, `${level}_nether`, `${level}_the_end`].filter((f) => existsSync(path.join(dir, f)))
}

export async function worldInfo(dir: string): Promise<WorldInfo> {
  const props = await readProperties(dir)
  const level = props['level-name'] || 'world'
  const folders = await Promise.all((await worldFolders(dir)).map(async (name) => ({ name, size: await dirSize(path.join(dir, name)) })))
  const dp = path.join(dir, level, 'datapacks')
  const datapacks = existsSync(dp) ? (await fsp.readdir(dp)).filter((f) => !f.startsWith('.')) : []
  return { levelName: level, folders, datapacks, seed: props['level-seed'] || '' }
}

async function walk(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await fsp.readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(root, r)))
    else if (e.name !== 'session.lock') out.push(r)
  }
  return out
}

/** Zips the folders file by file. The server keeps session.lock locked, so it is skipped; a stall fails loudly. */
async function zipFolders(dir: string, folders: string[], out: string): Promise<void> {
  const files: { abs: string; name: string }[] = []
  for (const f of folders) for (const r of await walk(path.join(dir, f))) files.push({ abs: path.join(dir, f, r), name: `${f}/${r}` })
  await new Promise<void>((resolve, reject) => {
    const os = createWriteStream(out)
    const a = new ZipArchive({ zlib: { level: 6 } })
    let last = Date.now()
    const watchdog = setInterval(() => { if (Date.now() - last > 60000) { clearInterval(watchdog); a.abort(); reject(new Error('Backup stalled while reading the world files.')) } }, 5000)
    a.on('entry', () => { last = Date.now() })
    a.on('progress', () => { last = Date.now() })
    a.on('error', (e) => { clearInterval(watchdog); reject(e) })
    a.on('warning', (e: any) => { if (e.code !== 'ENOENT') { clearInterval(watchdog); reject(e) } })
    os.on('close', () => { clearInterval(watchdog); resolve() })
    os.on('error', (e) => { clearInterval(watchdog); reject(e) })
    a.pipe(os)
    // read each file into memory first: a file the server is writing can't be streamed lazily
    ;(async () => {
      for (const f of files) {
        let buf: Buffer
        try { buf = await fsp.readFile(f.abs) } catch (e: any) { if (e.code === 'ENOENT') continue; throw e }
        // wait until archiver has taken this entry so the whole world is never held in memory at once
        const taken = new Promise((r) => a.once('entry', r))
        a.append(buf, { name: f.name })
        await taken
      }
      await a.finalize()
    })().catch((e) => { clearInterval(watchdog); reject(e) })
  })
}

export function unzip(zipFile: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err)
      const root = path.resolve(dest)
      zip.on('entry', async (e: yauzl.Entry) => {
        const target = path.resolve(dest, e.fileName)
        if (target !== root && !target.startsWith(root + path.sep)) { zip.close(); return reject(new Error('Unsafe path in zip: ' + e.fileName)) }
        if (/\/$/.test(e.fileName)) { await fsp.mkdir(target, { recursive: true }); return zip.readEntry() }
        await fsp.mkdir(path.dirname(target), { recursive: true })
        zip.openReadStream(e, (er, s) => {
          if (er || !s) return reject(er)
          s.pipe(createWriteStream(target)).on('close', () => zip.readEntry()).on('error', reject)
        })
      })
      zip.on('end', () => resolve())
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

const backupDir = (dir: string) => path.join(dir, 'backups')

export async function listBackups(dir: string): Promise<BackupInfo[]> {
  const d = backupDir(dir)
  if (!existsSync(d)) return []
  const out: BackupInfo[] = []
  for (const f of await fsp.readdir(d)) {
    if (!f.endsWith('.zip')) continue
    const st = await fsp.stat(path.join(d, f))
    out.push({ file: f, name: f.replace(/\.zip$/, ''), size: st.size, created: st.mtimeMs, auto: f.startsWith('auto-') })
  }
  return out.sort((a, b) => b.created - a.created)
}

/** Zips the world folders. While the server runs, saving is paused so the copy is consistent. */
export async function createBackup(dir: string, srv: ServerManager, auto = false): Promise<BackupInfo> {
  const folders = await worldFolders(dir)
  if (!folders.length) throw new Error('There is no world to back up yet.')
  await fsp.mkdir(backupDir(dir), { recursive: true })
  const name = `${auto ? 'auto' : 'backup'}-${stamp()}`
  const out = path.join(backupDir(dir), name + '.zip')
  const live = srv.stats.state === 'online'
  if (live) {
    srv.write('save-off')
    const saved = srv.waitFor(/Saved the game|Saving the game|saved/i, 30000)
    srv.write('save-all flush')
    await saved
  }
  try { await zipFolders(dir, folders, out) } finally { if (live) srv.write('save-on') }
  const st = await fsp.stat(out)
  return { file: name + '.zip', name, size: st.size, created: st.mtimeMs, auto }
}

export async function pruneAutoBackups(dir: string, keep: number) {
  const autos = (await listBackups(dir)).filter((b) => b.auto)
  for (const b of autos.slice(keep)) await fsp.rm(path.join(backupDir(dir), b.file), { force: true })
}

/** Replaces the world with a backup. Takes a safety backup of the current world first. */
export async function restoreBackup(dir: string, srv: ServerManager, file: string) {
  if (srv.running) throw new Error('Stop the server before restoring a backup.')
  const zip = path.join(backupDir(dir), path.basename(file))
  if (!existsSync(zip)) throw new Error('Backup not found.')
  if ((await worldFolders(dir)).length) await createBackup(dir, srv)
  for (const f of await worldFolders(dir)) await fsp.rm(path.join(dir, f), { recursive: true, force: true })
  await unzip(zip, dir)
}

export async function deleteBackup(dir: string, file: string) {
  await shell.trashItem(path.join(backupDir(dir), path.basename(file)))
}

async function findLevelDat(root: string, depth = 0): Promise<string | null> {
  if (existsSync(path.join(root, 'level.dat'))) return root
  if (depth > 3) return null
  for (const e of await fsp.readdir(root, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('__MACOSX')) {
      const r = await findLevelDat(path.join(root, e.name), depth + 1)
      if (r) return r
    }
  }
  return null
}

/** Imports a world from a .zip or a folder that contains level.dat. Backs up the current world first. */
export async function importWorld(dir: string, srv: ServerManager, source: string) {
  if (srv.running) throw new Error('Stop the server before importing a world.')
  const level = (await readProperties(dir))['level-name'] || 'world'
  const tmp = path.join(dir, `.import-${stamp()}`)
  try {
    let srcRoot = source
    if (source.toLowerCase().endsWith('.zip')) { await unzip(source, tmp); srcRoot = tmp }
    const found = await findLevelDat(srcRoot)
    if (!found) throw new Error('No level.dat found. Pick a Minecraft world folder or a zip of one.')
    if ((await worldFolders(dir)).length) await createBackup(dir, srv)
    for (const f of await worldFolders(dir)) await fsp.rm(path.join(dir, f), { recursive: true, force: true })
    await fsp.cp(found, path.join(dir, level), { recursive: true })
    await fsp.rm(path.join(dir, level, 'session.lock'), { force: true })
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

export async function exportWorld(dir: string, srv: ServerManager, dest: string) {
  const b = await createBackup(dir, srv)
  await fsp.copyFile(path.join(backupDir(dir), b.file), dest)
}

export async function resetWorld(dir: string, srv: ServerManager, seed: string) {
  if (srv.running) throw new Error('Stop the server before resetting the world.')
  if ((await worldFolders(dir)).length) await createBackup(dir, srv)
  for (const f of await worldFolders(dir)) await fsp.rm(path.join(dir, f), { recursive: true, force: true })
  await writeProperties(dir, { 'level-seed': seed })
}

export async function addDatapack(dir: string, file: string) {
  const level = (await readProperties(dir))['level-name'] || 'world'
  const d = path.join(dir, level, 'datapacks')
  await fsp.mkdir(d, { recursive: true })
  await fsp.copyFile(file, path.join(d, path.basename(file)))
}

export async function removeDatapack(dir: string, name: string) {
  const level = (await readProperties(dir))['level-name'] || 'world'
  await shell.trashItem(path.join(dir, level, 'datapacks', path.basename(name)))
}
