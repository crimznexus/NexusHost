import { useNexus } from './hooks/useNexus';
import { Activity, Cpu, Database, AlertCircle, Play, Square, Loader2, Globe, Copy, Check, Users, Terminal } from 'lucide-react';
import { useState } from 'react';
import { Console } from './components/Console';

export default function App() {
    const {
        isOnline, serverState, publicAddress, stats, logs, onlinePlayers,
        error, startServer, stopServer, sendCommand
    } = useNexus();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (publicAddress) {
            navigator.clipboard.writeText(publicAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const ramUsagePercent = stats
        ? Math.round((stats.ramUsed / stats.ramTotal) * 100)
        : 0;

    const getStatusColor = () => {
        switch (serverState) {
            case 'running': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'starting': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'error': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 p-6 font-sans">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Nexus Engine</h1>
                    <p className="text-zinc-400 flex items-center gap-2">
                        Phase 2: Containerized Minecraft Node
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${getStatusColor()}`}>
                        {serverState === 'starting' && <Loader2 size={14} className="animate-spin" />}
                        {serverState === 'running' && <Play size={14} fill="currentColor" />}
                        {serverState === 'offline' && <Square size={14} />}
                        {serverState === 'error' && <AlertCircle size={14} />}
                        <span className="capitalize">{serverState === 'offline' && !isOnline ? 'Engine Offline' : `Server ${serverState}`}</span>
                    </div>

                    <div className="flex border border-zinc-800 rounded-lg overflow-hidden">
                        <button
                            onClick={startServer}
                            disabled={!isOnline || serverState === 'running' || serverState === 'starting'}
                            className="flex items-center gap-2 bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed border-r border-zinc-200"
                        >
                            <Play size={14} fill="black" />
                            Start
                        </button>
                        <button
                            onClick={stopServer}
                            disabled={!isOnline || serverState === 'offline'}
                            className="flex items-center gap-2 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Square size={14} fill="white" />
                            Stop
                        </button>
                    </div>
                </div>
            </header>

            {error && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-rose-400 transition-all animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <main className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* CPU Stats */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Cpu size={18} className="text-emerald-500" />
                            Container CPU
                        </h3>
                        <span className="text-xs font-mono text-zinc-500">POLLING_2S</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-white tabular-nums">
                            {stats ? Math.round(stats.cpuLoad) : '--'}
                        </span>
                        <span className="mb-1 text-lg font-medium text-zinc-500">%</span>
                    </div>
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-700 ease-out"
                            style={{ width: `${stats ? Math.min(stats.cpuLoad, 100) : 0}%` }}
                        />
                    </div>
                </div>

                {/* RAM Stats */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Database size={18} className="text-blue-500" />
                            Container RAM
                        </h3>
                        <span className="text-xs font-mono text-zinc-500">
                            {stats ? `${(stats.ramTotal / 1024 / 1024 / 1024).toFixed(1)} GB CAP` : '--'}
                        </span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-white tabular-nums">
                            {stats ? (stats.ramUsed / 1024 / 1024 / 1024).toFixed(1) : '--'}
                        </span>
                        <span className="mb-1 text-lg font-medium text-zinc-500">GB</span>
                    </div>
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                            className="h-full bg-blue-500 transition-all duration-700 ease-out"
                            style={{ width: `${ramUsagePercent}%` }}
                        />
                    </div>
                </div>

                {/* Heartbeat Status */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-zinc-700" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Activity size={18} />
                            Nexus Stream
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live</span>
                            <span className={`h-2 w-2 rounded-full ${isOnline ? 'animate-pulse bg-emerald-500' : 'bg-zinc-700'}`} />
                        </div>
                    </div>
                    <p className="text-lg font-semibold text-white">
                        {stats ? new Date(stats.timestamp).toLocaleTimeString() : '---'}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                        <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {isOnline ? 'Engine handshake active' : 'Waiting for Engine connection'}
                    </div>
                </div>

                {/* Public Address Card (New) */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden group lg:col-span-1">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Globe size={18} className="text-purple-500" />
                            Public Access
                        </h3>
                        {publicAddress && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 flex items-center justify-between group/address overflow-hidden">
                            {publicAddress?.includes('/claim/') ? (
                                <a href={publicAddress} target="_blank" rel="noreferrer" className="text-sm font-medium text-purple-400 hover:text-purple-300 truncate underline block w-full text-center py-1">
                                    Click here to link Playit.gg account
                                </a>
                            ) : (
                                <>
                                    <span className="text-sm font-mono text-zinc-300 truncate mr-2">
                                        {publicAddress || 'Tunnel offline'}
                                    </span>
                                    <button
                                        onClick={handleCopy}
                                        disabled={!publicAddress}
                                        className="shrink-0 p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                    </button>
                                </>
                            )}
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {publicAddress?.includes('/claim/')
                                ? "Action Required: You must click the link above in your browser to assign a public IP to your server."
                                : "Use this Playit.gg address to connect to the Minecraft server from anywhere."}
                        </p>
                    </div>
                </div>

                {/* Online Players Card (New) */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Users size={18} className="text-rose-500" />
                            Online Players
                        </h3>
                        <span className="text-xs font-mono text-zinc-500">LIVE</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-white tabular-nums">
                            {onlinePlayers}
                        </span>
                        <span className="mb-1 text-lg font-medium text-zinc-500">/ 20</span>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${i < (onlinePlayers > 0 ? 5 : 0) ? 'bg-rose-500' : 'bg-zinc-800'}`}
                            />
                        ))}
                    </div>
                </div>
            </main>

            {/* Live Console Section (Full Width) */}
            <section className="mt-8">
                <div className="mb-4 flex items-center gap-2">
                    <Terminal size={18} className="text-zinc-500" />
                    <h2 className="text-lg font-semibold text-white">Live Terminal</h2>
                </div>
                <Console
                    logs={logs}
                    onSendCommand={sendCommand}
                    isOnline={isOnline && serverState === 'running'}
                />
            </section>

            <footer className="mt-12 border-t border-zinc-900 pt-6">
                <div className="flex flex-wrap gap-4 text-xs text-zinc-600 font-mono">
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
                        <span className="text-zinc-400">IMAGE:</span> itzg/minecraft-server:latest
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
                        <span className="text-zinc-400">PORT:</span> 25565
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
                        <span className="text-zinc-400">MEMORY_LIMIT:</span> 2G
                    </div>
                </div>
            </footer>
        </div>
    );
}
