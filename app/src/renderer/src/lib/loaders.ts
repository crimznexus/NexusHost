import type { Loader } from '@shared/types'

export const LOADER_LABEL: Record<Loader, string> = { paper: 'Paper', fabric: 'Fabric', neoforge: 'NeoForge', forge: 'Forge', vanilla: 'Vanilla' }

/** What the add-ons are called on this kind of server; null when it can't load any. */
export const addonWord = (l: Loader | undefined) => (!l || l === 'paper' ? 'plugin' : l === 'vanilla' ? null : 'mod')

export const LOADER_INFO: { id: Loader; title: string; hint: string }[] = [
  { id: 'paper', title: 'Paper', hint: 'Fast, and runs plugins. Players join with plain Minecraft. Best for most groups.' },
  { id: 'fabric', title: 'Fabric', hint: 'Runs Fabric mods: new blocks, items and mobs, or performance mods. Players need the same mods.' },
  { id: 'neoforge', title: 'NeoForge', hint: 'Runs NeoForge mods and most big modpacks (Create, tech and magic mods). Players need the same mods.' },
  { id: 'forge', title: 'Forge', hint: 'Runs Forge mods, including older modpacks. Players need the same mods.' },
  { id: 'vanilla', title: 'Vanilla', hint: "Mojang's own server, untouched. No plugins or mods." }
]