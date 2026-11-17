# Mods and plugins (Minecraft 26.3)

Everything below was checked on Modrinth (16 Nov 2026) and has a version for **Minecraft 26.3**. Entries marked *(beta)* work, but they're pre-release.

## How this works

The server runs **Paper**, which runs **plugins**, not mods. That gives three kinds of add-ons:

| Kind | Who installs it | Does everyone need it? |
|---|---|---|
| **Client mods** (map, health info, performance, graphics) | Each player, on their own PC | No. Each player picks their own, and they can join without any. |
| **Server plugins** (web map, voice chat, vein mining, graves) | The host, in `plugins/` | No client install needed, except voice chat |
| **Content mods** (new blocks, machines, food) | Server **and** every player | Yes. They also need the server switched from Paper to Fabric. See section 3. |

---

## 1. Client mods (each friend installs these)

**Easiest setup:** run the one-click installer from `build-installer.ps1`. It installs the mods listed in [`mods/client-mods.txt`](../mods/client-mods.txt); the tables below also mention a few optional alternatives (JourneyMap, BSL, Sound Physics) that it leaves out. Players who prefer the **Modrinth App** can create a Minecraft 26.3 Fabric profile and add the mods by name instead.

**Required base:**
- **Fabric API**
- **Mod Menu**: an in-game settings screen for all the mods

### Performance (most important on 2 GB graphics cards)
| Mod | What it does |
|---|---|
| **Sodium** *(beta)* | Rewrites the renderer and often doubles or triples FPS. Install this first. |
| **Lithium** | Faster game logic: less CPU lag and smoother ticks |
| **FerriteCore** | Uses much less RAM |
| **ImmediatelyFast** | Faster rendering for the HUD, text and entities |
| **Entity Culling** | Skips drawing mobs and chests you can't see |
| **More Culling** *(beta)* | Skips more hidden blocks and leaves |
| **Cull Leaves** | Leaves render hollow inside, which helps in forests |
| **Dynamic FPS** | Lowers FPS when the game is minimized, so the PC runs cooler |
| **Sodium Extra** + **Reese's Sodium Options** *(beta)* | Extra graphics toggles and a cleaner settings menu |

### Maps (important)
| Mod | What it does |
|---|---|
| **Xaero's Minimap** | Corner minimap, waypoints and death markers. **Recommended.** |
| **Xaero's World Map** | Full-screen map (M key). Pairs with Xaero's Minimap. |
| *or* **JourneyMap** | An alternative all-in-one map. Pick Xaero's or JourneyMap, not both. |

The server can also host a **live 3D web map** that anyone can open in a browser (BlueMap, in section 2).

### Health bars and information
| Mod | What it does |
|---|---|
| **Jade** | Shows a tooltip for whatever you look at: a mob's **health bar and hearts**, block name, crop growth, furnace progress |
| **AppleSkin** | Shows how much hunger and saturation food restores |

There's no floating health-bar-above-every-mob mod (Neat, ToroHealth) for 26.3 yet. **Jade** covers this for the mob you're looking at.

### Inventory and quality of life
| Mod | What it does |
|---|---|
| **Mouse Tweaks** | Drag and scroll to move items quickly |
| **Inventory Profiles Next** | Sorts the inventory and chests with one key, refills tools automatically |
| **Shulker Box Tooltip** | Shows shulker box contents on hover |
| **REI (Roughly Enough Items)** | Recipe viewer. **On a Paper server it can only show recipes you've already unlocked** (see the note in section 3). |
| **Zoomify** | Zoom with a key, like the OptiFine zoom |
| **Controlling** | A searchable key-binding menu |
| **Chat Heads** | Shows player heads next to chat messages |

### Graphics (careful with 2 GB graphics cards)
| Mod / pack | What it does | 2 GB card? |
|---|---|---|
| **Iris** | Loads shaders. Requires Sodium. | Yes |
| ↳ **MakeUp Ultra Fast** shader | Good-looking shader built for weak GPUs | **Best pick** |
| ↳ **Complementary Reimagined** shader | Beautiful. Set its profile to **Potato** or **Low**. | OK on low |
| ↳ **BSL** shader | Classic look, but heavier | Low settings only |
| **Continuity** | Connected glass and bookshelf textures | Yes |
| **3D Skin Layers** | 3D hats and jackets on player skins | Yes |
| **Visuality** *(beta)* | Small particles: sparkles, water drips | Yes |
| **Fresh Animations** (resource pack) | Smoother mob animations | Yes |
| **AmbientSounds** | Background sound for biomes, caves and wind | Yes |
| **Sound Physics Remastered** *(beta)* | Realistic echo in caves | Yes, uses the CPU |

**Tips for 2 GB graphics cards:**
- Render distance 8-10. Turn shaders off in big fights or at bases with lots of redstone.
- In the Modrinth App, give Minecraft **4 GB of RAM**: profile → Settings → Java and memory.
- Don't stack heavy shaders with a 32x resource pack.

### Voice chat (optional, and a lot of fun)
- **Simple Voice Chat** *(beta)* gives in-game voice chat by proximity. **It needs the server plugin from section 2 as well.**

---

## 2. Server plugins (`setup-server.ps1` installs these)

| Plugin | What it does | Notes |
|---|---|---|
| **BlueMap** | Live **3D web map** of the world at `http://<tailscale-ip>:8100` | Opens one extra port, through Tailscale only. Rendering the map uses CPU at first. |
| **Simple Voice Chat** *(beta)* | Server side of voice chat | Needs UDP port 24454 opened through Tailscale |
| **AxGraves** | When you die, your items go into a grave instead of despawning | Very friend-friendly |
| **Chunky** | Generates the map ahead of time so exploring doesn't lag | Run once and let it finish |
| **LuckPerms** | Fine-grained permissions | Only needed later, if `op` isn't enough |

**Datapack (new structures):**
- **Dungeons and Taverns** adds new villages, taverns and dungeons. It only affects **newly explored** areas, so an existing world's terrain stays the same.

Skip **Terralith** and **Incendium** on an existing world. They change terrain generation, which leaves hard edges where already-explored land meets new chunks.

---

## 3. Crafting and content mods (these need a different server)

Mods that add **new items, machines or recipes** must be installed on the **server and on every player's PC**. Paper can't run them, so the server would have to switch to a **Fabric server**. An existing world can be converted, but back it up first.

What exists for 26.3 right now:
- ✅ **Farmer's Delight Refabricated**: new crops, cooking and kitchen blocks
- ❌ **Create**: not available for 26.3 yet
- ❌ **Sophisticated Backpacks**, **Tom's Simple Storage**: not available for 26.3 yet

**About recipe viewers (REI/JEI):** since Minecraft 1.21.2, servers no longer send the full recipe list to players. On a Paper server, REI only shows recipes you've unlocked. On a Fabric server with REI installed, it shows every recipe.

**Recommendation:**
- **For now:** stay on Paper. Use the client mods from section 1 and the server plugins from section 2. AxGraves and BlueMap improve the game without anyone needing matching mods.
- **Later:** switch to Fabric once Create and the storage mods catch up to 26.3. A content pack is more fun when it includes them.

---

## Avoid
- **Freecam**, **X-ray** and similar mods. They count as cheating on a shared survival server.
- **VeinMiner**. It isn't a cheat, but mining a whole ore vein in one hit takes the effort out of survival, so it is left out.
- **OptiFine**. It doesn't work with Sodium or Iris; use those instead.
- Mods downloaded from random sites. Use **Modrinth** or **CurseForge** only.
