// nexushost/dashboard/src/hooks/useNexus.ts – NexusHost Dashboard
import { useEffect, useState, useCallback } from 'react';
import { socket } from '../lib/socket.js';
import { HeartbeatPayload, ServerState } from '../types.js';

export const useNexus = () => {
    const [isOnline, setIsOnline] = useState(false);
    const [serverState, setServerState] = useState<ServerState>('offline');
    const [publicAddress, setPublicAddress] = useState<string | null>(null);
    const [stats, setStats] = useState<HeartbeatPayload | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [onlinePlayers, setOnlinePlayers] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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

        return () => {
            socket.off('ENGINE_STATUS');
            socket.off('HEARTBEAT');
            socket.off('SERVER_STATE');
            socket.off('TUNNEL_URL');
            socket.off('SERVER_LOG');
            socket.off('HUB_ERROR');
        };
    }, []);

    const startServer = useCallback(() => {
        setError(null);
        socket.emit('START_SERVER');
    }, []);

    const stopServer = useCallback(() => {
        setError(null);
        socket.emit('STOP_SERVER');
    }, []);

    const sendCommand = useCallback((command: string) => {
        socket.emit('SEND_COMMAND', { command });
    }, []);

    return {
        isOnline,
        serverState,
        publicAddress,
        stats,
        logs,
        onlinePlayers,
        error,
        startServer,
        stopServer,
        sendCommand
    };
};
