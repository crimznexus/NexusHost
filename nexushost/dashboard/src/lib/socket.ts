// nexushost/dashboard/src/lib/socket.ts – NexusHost Dashboard
import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '../types.js';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

/* 
 * Shared socket instance exported for use in hooks.
 * This ensures only one connection is maintained.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(HUB_URL, {
    autoConnect: true
});
