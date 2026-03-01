import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ChevronDown } from 'lucide-react';

interface ConsoleProps {
    logs: string[];
    onSendCommand: (command: string) => void;
    isOnline: boolean;
}

export const Console: React.FC<ConsoleProps> = ({ logs, onSendCommand, isOnline }) => {
    const [command, setCommand] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (command.trim() && isOnline) {
            onSendCommand(command.trim());
            setCommand('');
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isAtBottom);
    };

    return (
        <div className="flex flex-col h-[400px] w-full rounded-xl border border-zinc-800 bg-black overflow-hidden relative group">
            {/* Console Header */}
            <div className="flex items-center justify-between bg-zinc-900/50 px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-400">
                    <Terminal size={16} />
                    <span className="text-xs font-mono font-medium uppercase tracking-wider">Live Console</span>
                </div>
                {!autoScroll && (
                    <button
                        onClick={() => setAutoScroll(true)}
                        className="flex items-center gap-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-1 rounded transition-colors"
                    >
                        <ChevronDown size={12} />
                        Resume Auto-scroll
                    </button>
                )}
            </div>

            {/* Logs Area */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
            >
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-700 italic">
                        Waiting for logs...
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="text-zinc-300 leading-relaxed break-all">
                            <span className="text-zinc-600 mr-2">[{i}]</span>
                            {log}
                        </div>
                    ))
                )}
            </div>

            {/* Command Input */}
            <form
                onSubmit={handleSubmit}
                className="p-3 border-t border-zinc-800 bg-zinc-900/50 flex gap-2"
            >
                <span className="text-emerald-500 font-mono text-sm self-center ml-1">$</span>
                <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    disabled={!isOnline}
                    placeholder={isOnline ? "Type a command (e.g. /help)..." : "Engine offline"}
                    className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-white placeholder:text-zinc-600 disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={!isOnline || !command.trim()}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-30"
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
};
