package io.github.crimznexus.nexusguard;

import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Locks each Minecraft name to the Tailscale account that first joined with it.
 *
 * Offline-mode servers can't verify names, so anyone who can reach the server could join as anyone.
 * Every NexusHost player arrives through Tailscale, and Tailscale knows which account owns each
 * connection ("tailscale whois"). On first join a whitelisted name is bound to that account; later
 * joins under that name from any other account are refused before the player enters the world.
 *
 * bindings.yml is re-read on every login, so the NexusHost app can edit it while the server runs.
 */
public final class NexusGuard extends JavaPlugin implements Listener {
    private static final Pattern USER_ID = Pattern.compile("\"UserProfile\"\\s*:\\s*\\{[^}]*?\"ID\"\\s*:\\s*(\\d+)");
    private static final Pattern LOGIN = Pattern.compile("\"LoginName\"\\s*:\\s*\"([^\"]*)\"");
    private static final Pattern DISPLAY = Pattern.compile("\"DisplayName\"\\s*:\\s*\"([^\"]*)\"");
    private static final Pattern NODE = Pattern.compile("\"Node\"\\s*:\\s*\\{.*?\"ComputedName\"\\s*:\\s*\"([^\"]*)\"", Pattern.DOTALL);

    private File bindingsFile;
    private String tailscale;
    private final Object lock = new Object();

    record Identity(String userId, String login, String display, String device) {}

    @Override
    public void onEnable() {
        saveDefaultConfig();
        tailscale = getConfig().getString("tailscale-path", "C:\\Program Files\\Tailscale\\tailscale.exe");
        bindingsFile = new File(getDataFolder(), "bindings.yml");
        if (!new File(tailscale).isFile()) getLogger().warning("tailscale not found at " + tailscale + ". Only this PC can join until it is fixed in config.yml.");
        Bukkit.getPluginManager().registerEvents(this, this);
        getLogger().info("Names are locked to Tailscale accounts (" + load().getKeys(false).size() + " locked).");
    }

    private YamlConfiguration load() {
        synchronized (lock) { return YamlConfiguration.loadConfiguration(bindingsFile); }
    }

    private void save(YamlConfiguration y) {
        synchronized (lock) {
            try { y.save(bindingsFile); } catch (IOException e) { getLogger().severe("Could not save bindings.yml: " + e.getMessage()); }
        }
    }

    /** True when the connection comes from this PC (loopback or one of its own addresses). */
    private static boolean isThisPc(InetAddress a) {
        try { return a.isLoopbackAddress() || a.isAnyLocalAddress() || NetworkInterface.getByInetAddress(a) != null; }
        catch (Exception e) { return false; }
    }

    private Identity whois(String ip) {
        try {
            Process p = new ProcessBuilder(tailscale, "whois", "--json", ip).redirectErrorStream(true).start();
            if (!p.waitFor(5, TimeUnit.SECONDS)) { p.destroyForcibly(); return null; }
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Matcher id = USER_ID.matcher(out);
            if (p.exitValue() != 0 || !id.find()) return null;
            Matcher login = LOGIN.matcher(out), display = DISPLAY.matcher(out), node = NODE.matcher(out);
            return new Identity(id.group(1), login.find() ? login.group(1) : "", display.find() ? display.group(1) : "", node.find() ? node.group(1) : "");
        } catch (Exception e) {
            getLogger().warning("tailscale whois failed: " + e.getMessage());
            return null;
        }
    }

    private Identity selfIdentity() {
        try {
            Process p = new ProcessBuilder(tailscale, "ip", "-4").redirectErrorStream(true).start();
            if (!p.waitFor(5, TimeUnit.SECONDS)) { p.destroyForcibly(); return null; }
            String ip = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim().split("\\s+")[0];
            return ip.startsWith("100.") ? whois(ip) : null;
        } catch (Exception e) { return null; }
    }

    @SuppressWarnings("deprecation") // String kick messages keep the plugin independent of the Adventure API version
    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPreLogin(AsyncPlayerPreLoginEvent e) {
        if (e.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) return;
        String name = e.getName();
        String key = name.toLowerCase(Locale.ROOT);
        InetAddress addr = e.getAddress();

        Identity who = isThisPc(addr) ? selfIdentity() : whois(addr.getHostAddress());
        if (who == null) {
            if (isThisPc(addr)) return; // the host's own PC is trusted even if Tailscale is down
            e.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER, "Could not confirm your Tailscale account. Make sure Tailscale is connected, then try again.");
            getLogger().warning("Refused " + name + " from " + addr.getHostAddress() + ": no Tailscale identity");
            return;
        }

        YamlConfiguration y = load();
        ConfigurationSection b = y.getConfigurationSection(key);
        if (b == null) {
            // Only whitelisted names get locked, so random names can't reserve themselves.
            if (Bukkit.hasWhitelist()) {
                boolean listed = false;
                for (OfflinePlayer op : Bukkit.getWhitelistedPlayers()) if (name.equalsIgnoreCase(op.getName())) { listed = true; break; }
                if (!listed) return; // the server's own whitelist check refuses them next
            }
            ConfigurationSection n = y.createSection(key);
            n.set("name", name);
            n.set("tailscale-user-id", who.userId());
            n.set("tailscale-login", who.login());
            n.set("tailscale-name", who.display());
            n.set("device", who.device());
            n.set("locked-at", Instant.now().toString());
            save(y);
            getLogger().info("Locked the name " + name + " to Tailscale account " + who.display() + " (" + who.login() + ")");
            return;
        }
        if (!who.userId().equals(b.getString("tailscale-user-id"))) {
            e.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER,
                "The name " + name + " belongs to another player.\nJoin with your own name, or ask the host to reset it.");
            getLogger().warning("Refused " + name + ": joined from Tailscale account " + who.login() + " but the name is locked to " + b.getString("tailscale-login"));
        }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (args.length == 0 || args[0].equalsIgnoreCase("list")) {
            YamlConfiguration y = load();
            if (y.getKeys(false).isEmpty()) sender.sendMessage("No names are locked yet.");
            for (String k : y.getKeys(false)) sender.sendMessage(y.getString(k + ".name", k) + " -> " + y.getString(k + ".tailscale-name", "") + " <" + y.getString(k + ".tailscale-login", "") + ">");
            return true;
        }
        if (args[0].equalsIgnoreCase("reset") && args.length == 2) {
            YamlConfiguration y = load();
            String k = args[1].toLowerCase(Locale.ROOT);
            if (!y.contains(k)) { sender.sendMessage(args[1] + " is not locked."); return true; }
            y.set(k, null);
            save(y);
            sender.sendMessage(args[1] + " is unlocked. It locks again to whoever joins with it next.");
            return true;
        }
        sender.sendMessage("Usage: /nexusguard list | /nexusguard reset <name>");
        return true;
    }
}
