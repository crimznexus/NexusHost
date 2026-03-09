// nexushost/dashboard/src/lib/socket.ts – NexusHost Dashboard
import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '../types.js';

// @ts-ignore - Vite specific
const DEFAULT_URL = import.meta.env?.VITE_HUB_URL || 'http://localhost:3001';

export let socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(DEFAULT_URL, {
    autoConnect: true
});

/**
 * Update the socket connection to a dynamic tunnel URL
 */
export function connectToNexus(url: string) {
    if (!url) return;

    console.log(`[SOCKET] Switching connection to: ${url}`);

    if (socket) {
        socket.disconnect();
    }

    socket = io(url, {
        autoConnect: true
    });
}
