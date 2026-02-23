import { useNexus } from './hooks/useNexus';
import { Activity, Cpu, Database, AlertCircle, Signal, SignalLow } from 'lucide-react';

export default function App() {
    const { isOnline, stats, error, startTest } = useNexus();

    const ramUsagePercent = stats
        ? Math.round((stats.ramUsed / stats.ramTotal) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-zinc-950 p-6 font-sans">
            <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Nexus Connection</h1>
                    <p className="text-zinc-400">Phase I: Real-time Heartbeat System</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                        {isOnline ? <Signal size={16} /> : <SignalLow size={16} />}
                        {isOnline ? 'Engine Online' : 'Engine Offline'}
                    </div>
                    <button
                        onClick={startTest}
                        disabled={!isOnline}
                        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Start Test
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-rose-400">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <main className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* CPU Stats */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Cpu size={18} />
                            CPU Load
                        </h3>
                        <span className="text-sm text-zinc-500">Real-time</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-white">
                            {stats ? Math.round(stats.cpuLoad) : '--'}
                        </span>
                        <span className="mb-1 text-lg font-medium text-zinc-500">%</span>
                    </div>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${stats ? stats.cpuLoad : 0}%` }}
                        />
                    </div>
                </div>

                {/* RAM Stats */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Database size={18} />
                            RAM Usage
                        </h3>
                        <span className="text-sm text-zinc-500">
                            {stats ? `${(stats.ramTotal / 1024 / 1024 / 1024).toFixed(1)} GB Total` : ''}
                        </span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-white">
                            {stats ? (stats.ramUsed / 1024 / 1024 / 1024).toFixed(1) : '--'}
                        </span>
                        <span className="mb-1 text-lg font-medium text-zinc-500">GB</span>
                    </div>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${ramUsagePercent}%` }}
                        />
                    </div>
                </div>

                {/* Heartbeat Status */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-zinc-300">
                            <Activity size={18} />
                            Last Heartbeat
                        </h3>
                        <span className={`h-2 w-2 rounded-full ${isOnline ? 'animate-pulse bg-emerald-500' : 'bg-zinc-700'}`} />
                    </div>
                    <p className="text-lg font-medium text-white">
                        {stats ? new Date(stats.timestamp).toLocaleTimeString() : 'Waiting for connection...'}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">
                        {isOnline ? 'Bidirectional stream active' : 'Waiting for Engine registration'}
                    </p>
                </div>
            </main>
        </div>
    );
}
