// nexushost/engine/src/index.ts – NexusHost Engine
import { io, Socket } from 'socket.io-client';
import si from 'systeminformation';
import dotenv from 'dotenv';
import {
    ClientToServerEvents,
    ServerToClientEvents
} from './types.js';

dotenv.config();

const HUB_URL = process.env.HUB_URL || 'http://localhost:3001';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(HUB_URL);

let heartbeatInterval: NodeJS.Timeout | null = null;

socket.on('connect', () => {
    process.stdout.write(`[ENGINE] Connected to Hub: ${socket.id}\n`);
    socket.emit('ENGINE_CONNECT');

    // Start heartbeat loop
    heartbeatInterval = setInterval(sendHeartbeat, 2000);
});

async function sendHeartbeat() {
    try {
        // Concurrent fetch for performance
        const [cpu, mem] = await Promise.all([
            si.currentLoad(),
            si.mem()
        ]);

        const payload = {
            cpuLoad: cpu.currentLoad,
            ramUsed: mem.active,
            ramTotal: mem.total,
            timestamp: new Date().toISOString()
        };

        socket.emit('HEARTBEAT', payload);
    } catch (err) {
        process.stdout.write(`[ENGINE] Failed to collect stats: ${err}\n`);
    }
}

socket.on('TEST_START', () => {
    // Logic for "Start Server" signal - currently just a log for Phase I
    process.stdout.write(`[ENGINE] Received TEST_START command from Hub\n`);
});

socket.on('disconnect', () => {
    process.stdout.write(`[ENGINE] Disconnected from Hub\n`);
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
});

socket.on('connect_error', (error) => {
    process.stdout.write(`[ENGINE] Connection error: ${error.message}\n`);
});
