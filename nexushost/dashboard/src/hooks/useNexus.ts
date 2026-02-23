// nexushost/dashboard/src/hooks/useNexus.ts – NexusHost Dashboard
import { useEffect, useState, useCallback } from 'react';
import { socket } from '../lib/socket.js';
import { HeartbeatPayload } from '../types.js';

export const useNexus = () => {
    const [isOnline, setIsOnline] = useState(false);
    const [stats, setStats] = useState<HeartbeatPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        socket.emit('DASHBOARD_CONNECT');

        socket.on('ENGINE_STATUS', ({ online }) => {
            setIsOnline(online);
            // Clear stats if engine goes offline as per spec
            if (!online) {
                setStats(null);
            }
        });

        socket.on('HEARTBEAT', (payload) => {
            setStats(payload);
            setIsOnline(true);
        });

        socket.on('HUB_ERROR', ({ message }) => {
            setError(message);
        });

        return () => {
            socket.off('ENGINE_STATUS');
            socket.off('HEARTBEAT');
            socket.off('HUB_ERROR');
        };
    }, []);

    const startTest = useCallback(() => {
        setError(null);
        socket.emit('TEST_START');
    }, []);

    return {
        isOnline,
        stats,
        error,
        startTest
    };
};
