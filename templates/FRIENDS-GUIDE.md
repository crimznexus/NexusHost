# {{SERVER_NAME}}: how to join

Minecraft **Java Edition {{MC_VERSION}}**. The server is reached through Tailscale, so nobody needs to forward ports.

Server address: **`{{SERVER_IP}}`** (default port, nothing else to type)

## 1. Get onto the private network (once)

1. Install Tailscale from https://tailscale.com/download.
2. Sign in to Tailscale with **your own** Google, Microsoft or GitHub account. It's free.
3. Open the **share invite link** the host sends you and accept it. The server PC then appears in your Tailscale device list. You can reach only that PC, and the host can't see your devices.
4. Send the host your **exact Minecraft username** so they can add you to the whitelist.

## 2. Install the mods (one click)

1. **Quit Minecraft and close the Minecraft Launcher completely**, including from the system tray. If the launcher is open, it erases the new profile when it closes.
2. Double-click **`{{INSTALLER}}`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**. It's a plain script; you can open it in Notepad to read it.
   - It installs Fabric and {{MOD_COUNT}} mods, shaders and packs from Modrinth, checks every file's hash, and creates a launcher profile named **{{SERVER_NAME}} (Fabric {{MC_VERSION}})**. Your normal Minecraft and your worlds aren't touched.
   - Run it again whenever the host sends a newer version. It only downloads what changed.

## 3. Play

1. Make sure Tailscale is connected (tray icon active).
2. Open the Minecraft Launcher, pick **{{SERVER_NAME}} (Fabric {{MC_VERSION}})** next to the Play button, and press **Play**.
3. Multiplayer → **{{SERVER_NAME}}** is already in your list.

| Key | What it does |
|---|---|
| K | Shaders on/off. Turn them off if the game lags. |
| M | World map |
| C | Zoom |
| V | Voice chat settings |

Live web map: http://{{SERVER_IP}}:{{BLUEMAP_PORT}} (Tailscale must be on)

## Can't connect?

- Is Tailscale connected on your PC?
- Did the host add you to the whitelist?
- Did you start the **{{SERVER_NAME}}** profile (not "Latest release")?
- Getting kicked with "Timed out"? Your Tailscale connection may be going through a relay. Run `tailscale netcheck` and send the host the output.
