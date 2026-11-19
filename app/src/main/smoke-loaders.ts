// Developer test (not shipped): version lists, loader versions, Fabric/Vanilla downloads and detection.
//   NEXUS_SMOKE_OUT=<results dir> NEXUS_JAVA=<java.exe>
import path from 'node:path'
import { mkdirSync, promises as fsp, writeFileSync } from 'node:fs'
import { app } from 'electron'

const out = process.env.NEXUS_SMOKE_OUT!
app.setPath('userData', path.join(out, 'userdata'))
const log: string[] = []
async function step(name: string, fn: () => Promise<string>) { try { log.push(`PASS ${name}: ${await fn()}`) } catch (e: any) { log.push(`FAIL ${name}: ${e.message}`) } }

app.whenReady().then(async () => {
  const L = await import('./loaders')
  try {
    for (const l of L.LOADERS) {
      await step(`${l} versions`, async () => { const v = await L.mcVersions(l); if (!v.versions.includes('26.3')) throw new Error(`no 26.3 in ${v.versions.slice(0, 5)}`); return `${v.versions.length} versions, latest ${v.latest}` })
      await step(`${l} software 26.3`, async () => { const s = await L.software(l, '26.3'); if (!s.latest) throw new Error('no latest'); return `latest ${s.latest}, ${s.builds.length} builds` })
      await step(`${l} java`, async () => { const j = await L.javaRequirement(l, '26.3'); return `java ${j.javaMin}, ${j.flags.length} flags` })
    }
    await step('neoMc mapping', async () => {
      const cases: [string, string | null][] = [['21.1.267', '1.21.1'], ['21.0.167', '1.21'], ['20.4.237', '1.20.4'], ['26.3.0.113', '26.3'], ['26.1.2.127', '26.1.2'], ['21.11.0-beta', '1.21.11']]
      const bad = cases.filter(([v, mc]) => L.neoMc(v) !== mc).map(([v, mc]) => `${v}->${L.neoMc(v)} (want ${mc})`)
      if (bad.length) throw new Error(bad.join(', '))
      return 'ok'
    })
    for (const l of ['fabric', 'vanilla'] as const) {
      await step(`${l} install`, async () => {
        const dir = path.join(out, l)
        const v = await L.installLoader(dir, l, '26.3', process.env.NEXUS_JAVA!, () => {})
        const d = L.detectLoader(dir)
        const a = L.launchArgs(dir, l)
        if (d?.loader !== l || d.mcVersion !== '26.3') throw new Error(`detected ${JSON.stringify(d)}`)
        return `${v}; detected ${d.loader} ${d.mcVersion} ${d.loaderVersion}; args ${a?.args.join(' ')}`
      })
    }
    await step('detect fake neoforge + forge layouts', async () => {
      const r: string[] = []
      for (const [l, rel, bat] of [
        ['neoforge', 'libraries/net/neoforged/neoforge/26.3.0.113', 'java @user_jvm_args.txt @libraries/net/neoforged/neoforge/26.3.0.113/win_args.txt %*'],
        ['forge', 'libraries/net/minecraftforge/forge/26.3-66.1.9', 'java @user_jvm_args.txt @libraries/net/minecraftforge/forge/26.3-66.1.9/win_args.txt %*']
      ] as const) {
        const dir = path.join(out, 'fake-' + l)
        mkdirSync(path.join(dir, rel), { recursive: true })
        writeFileSync(path.join(dir, rel, 'win_args.txt'), '-p x')
        writeFileSync(path.join(dir, 'run.bat'), bat)
        const d = L.detectLoader(dir)
        if (d?.loader !== l || d.mcVersion !== '26.3') throw new Error(`${l}: ${JSON.stringify(d)}`)
        r.push(`${l} ${d.mcVersion} ${d.loaderVersion} [${L.launchArgs(dir, l)!.args.join(' ')}]`)
      }
      return r.join('; ')
    })
    await step('mod search (fabric)', async () => {
      const { searchPlugins } = await import('./plugins')
      const h = await searchPlugins('', '26.3', 'fabric')
      return `${h.length} hits, e.g. ${h.slice(0, 3).map((x) => `${x.title}(${x.client_side})`).join(', ')}`
    })
    await step('mod install with deps (fabric)', async () => {
      const P = await import('./plugins')
      const dir = path.join(out, 'fabric')
      await P.installPlugin(dir, 'fabric', 'lithium', '26.3')
      await P.installPlugin(dir, 'fabric', 'simple-voice-chat', '26.3')
      const list = await P.listPlugins(dir, 'fabric', '26.3', false)
      const client = await P.clientMods(dir, 'fabric', '26.3')
      return `${list.map((p) => `${p.name} ${p.version}${p.clientNeeded ? ' [client]' : ''}`).join(', ')}; players need: ${client.map((c) => c.slug).join(', ') || 'none'}`
    })
  } finally {
    await fsp.writeFile(path.join(out, 'loaders-result.txt'), log.join('\n'))
    app.exit(0)
  }
})
