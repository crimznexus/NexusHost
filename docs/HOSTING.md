# Hosting guide

Everything here runs on the host PC, from the repo folder.

## Sharing the server with friends (Tailscale)

Each friend uses **their own** Tailscale account. You share only the server PC with them, so they can't see your other devices and you can't see theirs.

1. Open https://login.tailscale.com/admin/machines.
2. Click **…** next to the server PC, then **Share**.
3. Copy the invite link and send it to one friend. Each link can be accepted once, so make one per friend.

Your Tailscale IP is shown by `tailscale ip -4`. It stays the same as long as the PC stays in your tailnet.

## Server console

Type these into the `start.bat` window:

| Task | Command |
|---|---|
| Add a friend to the whitelist | `whitelist add <name>` |
| Remove a friend | `whitelist remove <name>` |
| Make someone an operator (admin) | `op <name>` |
| See who's online | `list` |
| Stop the server safely | `stop` |

Always stop with `stop`. Closing the window can lose world data.

## Using an existing world

1. Stop the server.
2. Put the world folder at `server\world` (it must contain `level.dat`). If you have a zip, extract it and move the folder that contains `level.dat`.
3. Start the server. Paper upgrades older worlds automatically, so make a backup first.

A singleplayer world was played in offline mode, so its player data is stored under offline UUIDs. On an online-mode server players start with fresh inventories unless you rename `playerdata\<offline-uuid>.dat` to their online UUID.

## Pre-generating the map (less lag while exploring)

When nobody is online, in the console:

```
chunky radius 3000
chunky start
```

It runs in the background and survives restarts. `chunky cancel` stops it.

## Updates

```bash
pwsh -File setup-server.ps1
```

This downloads the newest stable Paper build and plugin versions, moves replaced jars to `old-jars` / `plugins-old`, and rewrites `start.bat`. To move to a new Minecraft version, change `mcVersion` and `dataVersion` in `nexus.config.json`, back up the world, run setup again, then rebuild the friend installer with `-Resolve`.

## Backups

Stop the server, then copy `server\world` (and `world_nether`, `world_the_end` if they exist) somewhere safe. Weekly copies to OneDrive or an external drive are a good habit.

## Laptop tips

- Keep it plugged in and use the **Best performance** power mode.
- Settings → System → Power → **Sleep: Never** while hosting. A sleeping PC drops everyone.
- If the lid is closed: Control Panel → Power Options → "When I close the lid" → **Do nothing**.

## Troubleshooting

- **A friend keeps timing out or gets kicked for "floating too long"**: their Tailscale traffic is probably going through a DERP relay (high ping). Ask them to run `tailscale status` while connected: `relay "xxx"` means relayed, `direct` is good. Enabling UPnP on their router, or a different network, usually gets a direct connection.
- **Friend's mods don't show up**: they launched "Latest release" instead of the server profile, or the launcher was open while the installer ran. Close the launcher fully and run the installer again.
- **"Outdated client/server"**: the friend's profile isn't on the server's Minecraft version. Rebuild and resend the installer.
