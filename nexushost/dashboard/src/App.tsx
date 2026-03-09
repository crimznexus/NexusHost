import { useNexus } from './hooks/useNexus';
import { Activity, Cpu, Database, AlertCircle, Play, Square, Loader2, Globe, Copy, Check, Terminal } from 'lucide-react';
import { useState } from 'react';
import { Console } from './components/Console';

export default function App() {
    const {
        isOnline, serverState, publicAddress, stats, logs,
        error, role, joinId, setRole, startServer, stopServer, sendCommand,
        connectToHub
    } = useNexus();
    const [copied, setCopied] = useState(false);
    const [joinInput, setJoinInput] = useState('');

    const onJoin = () => {
        if (!joinInput) return;
        connectToHub(joinInput);

        try {
            if ((window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('start-game-proxy', joinInput);
            }
        } catch (e) {
            console.warn('Electron IPC not available', e);
        }

        setRole('friend');
    };

    const handleCopy = () => {
        const textToCopy = role === 'friend' ? 'localhost:25565' : publicAddress;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
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

    // Role Selection / Join Screen
    if (!role) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
                <div className="w-full max-w-md space-y-8 text-center">
                    <div>
                        <div className="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                            <Activity className="text-black" size={32} />
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">NexusHost</h1>
                        <p className="text-zinc-500 mt-2">Zero-Config Minecraft Hosting</p>
                    </div>

                    <div className="grid gap-4">
                        <button
                            onClick={() => setRole('host')}
                            className="bg-white text-black font-semibold py-4 px-6 rounded-xl hover:opacity-90 transition-all flex items-center justify-between group"
                        >
                            <div className="text-left">
                                <div className="text-sm">Start a Server</div>
                                <div className="text-xs opacity-60">I want to host and play</div>
                            </div>
                            <Play fill="black" size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>

                        <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-900" /></div>
                            <span className="relative px-3 bg-zinc-950 text-xs text-zinc-600 font-mono">OR JOIN A FRIEND</span>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Enter NEXUS-ID (e.g. 7A2B)"
                                value={joinInput}
                                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                className="w-full bg-zinc-900 border border-zinc-800 text-white px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-700 transition-all text-center font-mono tracking-widest uppercase"
                            />
                            <button
                                onClick={onJoin}
                                disabled={!joinInput}
                                className="w-full bg-zinc-800 text-white font-semibold py-4 px-6 rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                <Globe size={18} />
                                Connect to Hub
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 p-6 font-sans">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                        {role === 'host' ? 'Nexus Server' : 'Nexus Client'}
                    </h1>
                    <p className="text-zinc-400 flex items-center gap-2">
                        {role === 'host' ? 'Hosting & Management' : `Remote Controlling: ${joinId}`}
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
                            {role === 'host' ? 'Start' : 'Remote Start'}
                        </button>
                        <button
                            onClick={stopServer}
                            disabled={!isOnline || serverState === 'offline'}
                            className="flex items-center gap-2 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Square size={14} fill="white" />
                            {role === 'host' ? 'Stop' : 'Remote Stop'}
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
                {/* Status and Stats Cards (Same for both but with role distinctions) */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Cpu size={18} className="text-emerald-500" />
                            {role === 'host' ? 'Container CPU' : 'Remote CPU'}
                        </h3>
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

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Database size={18} className="text-blue-500" />
                            {role === 'host' ? 'Container RAM' : 'Remote RAM'}
                        </h3>
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

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 opacity-50" />
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Globe size={18} className="text-purple-500" />
                            {role === 'host' ? 'Public Identity' : 'Game IP'}
                        </h3>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 flex items-center justify-between overflow-hidden">
                            <span className="text-sm font-mono text-zinc-300 truncate mr-2">
                                {role === 'friend' && isOnline ? 'localhost:25565' : (publicAddress || 'Offline')}
                            </span>
                            <button
                                onClick={handleCopy}
                                disabled={!(role === 'friend' && isOnline) && !publicAddress}
                                className="shrink-0 p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 transition-colors"
                            >
                                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                        </div>
                        {role === 'host' && (
                            <div className="flex items-center justify-between bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700 border-dashed">
                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Your NEXUS-ID:</span>
                                <span className="text-sm font-mono font-bold text-emerald-400">{joinId || '....'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <section className="mt-8">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal size={18} className="text-zinc-500" />
                        <h2 className="text-lg font-semibold text-white">Live Console</h2>
                    </div>
                    {role === 'friend' && (
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">
                            <Check size={10} /> REMOTE ACCESS GRANTED
                        </div>
                    )}
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
                        <span className="text-zinc-400">ROLE:</span> {role === 'host' ? 'MASTER_NODE' : 'BRIDGE_CLIENT'}
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
                        <span className="text-zinc-400">SESSION:</span> {stats ? 'ACTIVE' : 'IDLE'}
                    </div>
                </div>
            </footer>
        </div>
    );
}
