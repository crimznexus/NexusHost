// nexushost/dashboard/src/hooks/useNexus.ts – NexusHost Dashboard
import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { HeartbeatPayload, ServerState, ClientToServerEvents, ServerToClientEvents } from '../types.js';

// @ts-ignore - Vite specific
const DEFAULT_URL = import.meta.env?.VITE_HUB_URL || 'http://localhost:3001';

export const useNexus = () => {
    const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents>>(() => io(DEFAULT_URL));
    const [isOnline, setIsOnline] = useState(false);
    const [serverState, setServerState] = useState<ServerState>('offline');
    const [publicAddress, setPublicAddress] = useState<string | null>(null);
    const [stats, setStats] = useState<HeartbeatPayload | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [onlinePlayers, setOnlinePlayers] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [role, setRole] = useState<'host' | 'friend' | null>(null);
    const [joinId, setJoinId] = useState<string>('');

    // Persistence ref for role to avoid resets on socket change
    const roleRef = useRef<'host' | 'friend' | null>(null);

    const connectToHub = useCallback((url: string) => {
        if (!url) return;

        // Normalize URL (add protocol if missing)
        let normalizedUrl = url;
        if (!url.startsWith('http')) {
            normalizedUrl = `http://${url}`;
        }

        console.log(`[useNexus] Switching Hub to: ${normalizedUrl}`);

        setSocket(prev => {
            if (prev) prev.disconnect();
            return io(normalizedUrl);
        });
    }, []);

    useEffect(() => {
        if (!socket) return;

        socket.emit('DASHBOARD_CONNECT');

        socket.on('ENGINE_STATUS', ({ online }) => {
            setIsOnline(online);
            if (!online) {
                setStats(null);
                setServerState('offline');
                setPublicAddress(null);
                setOnlinePlayers(0);
            }
        });

        socket.on('HEARTBEAT', (payload) => {
            setStats(payload);
            setIsOnline(true);
        });

        socket.on('SERVER_STATE', ({ state }) => {
            setServerState(state);
            if (state === 'offline' || state === 'error') {
                setStats(null);
                setPublicAddress(null);
                setOnlinePlayers(0);
                setLogs([]);
            }
        });

        socket.on('TUNNEL_URL', ({ url }) => {
            setPublicAddress(url);
        });

        socket.on('SERVER_LOG', ({ line }) => {
            setLogs(prev => [...prev.slice(-199), line]);

            // Player join/leave parsing
            if (line.includes('joined the game')) setOnlinePlayers(p => p + 1);
            if (line.includes('left the game')) setOnlinePlayers(p => p - Math.max(0, 1));
        });

        socket.on('HUB_ERROR', ({ message }) => {
            setError(message);
        });

        socket.on('NEXUS_ID', ({ id }) => {
            setJoinId(id);
        });

        return () => {
            socket.off('ENGINE_STATUS');
            socket.off('HEARTBEAT');
            socket.off('SERVER_STATE');
            socket.off('TUNNEL_URL');
            socket.off('SERVER_LOG');
            socket.off('HUB_ERROR');
            socket.off('NEXUS_ID');
        };
    }, [socket]);

    const startServer = useCallback(() => {
        setError(null);
        socket.emit('START_SERVER');
    }, [socket]);

    const stopServer = useCallback(() => {
        setError(null);
        socket.emit('STOP_SERVER');
    }, [socket]);

    const sendCommand = useCallback((command: string) => {
        socket.emit('SEND_COMMAND', { command });
    }, [socket]);

    return {
        isOnline,
        serverState,
        publicAddress,
        stats,
        logs,
        onlinePlayers,
        error,
        role,
        joinId,
        setRole: (newRole: 'host' | 'friend' | null) => {
            roleRef.current = newRole;
            setRole(newRole);
        },
        connectToHub,
        startServer,
        stopServer,
        sendCommand
    };
};
