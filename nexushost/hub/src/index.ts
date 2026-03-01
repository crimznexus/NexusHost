// nexushost/hub/src/index.ts – NexusHost Hub
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
} from './types.js';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let engineSocketId: string | null = null;

io.on('connection', (socket) => {
    // Log connection without using console.log directly
    process.stdout.write(`[HUB] New connection: ${socket.id}\n`);

    socket.on('ENGINE_CONNECT', () => {
        engineSocketId = socket.id;
        socket.data.type = 'engine';
        process.stdout.write(`[HUB] Engine registered: ${socket.id}\n`);
        io.emit('ENGINE_STATUS', { online: true });
    });

    socket.on('DASHBOARD_CONNECT', () => {
        socket.data.type = 'dashboard';
        process.stdout.write(`[HUB] Dashboard registered: ${socket.id}\n`);
        // Immediately inform dashboard of current engine status
        socket.emit('ENGINE_STATUS', { online: engineSocketId !== null });
    });

    socket.on('HEARTBEAT', (payload) => {
        // Validate that HEARTBEAT only comes from the registered Engine
        if (socket.id !== engineSocketId) {
            process.stdout.write(`[HUB] Rejected HEARTBEAT from non-engine socket: ${socket.id}\n`);
            return;
        }

        // Relay to everyone else (Dashboards)
        socket.broadcast.emit('HEARTBEAT', payload);
    });

    socket.on('START_SERVER', () => {
        if (engineSocketId) {
            process.stdout.write(`[HUB] Relaying START_SERVER to Engine\n`);
            io.to(engineSocketId).emit('START_SERVER');
        } else {
            socket.emit('HUB_ERROR', { message: 'Engine offline - cannot start server' });
        }
    });

    socket.on('STOP_SERVER', () => {
        if (engineSocketId) {
            process.stdout.write(`[HUB] Relaying STOP_SERVER to Engine\n`);
            io.to(engineSocketId).emit('STOP_SERVER');
        } else {
            socket.emit('HUB_ERROR', { message: 'Engine offline - cannot stop server' });
        }
    });

    socket.on('SERVER_STATE', (payload) => {
        // Relay state from Engine to all Dashboards
        if (socket.id === engineSocketId) {
            socket.broadcast.emit('SERVER_STATE', payload);
        }
    });

    socket.on('ERROR', (payload) => {
        // Relay engine error as Hub Error to all Dashboards
        if (socket.id === engineSocketId) {
            socket.broadcast.emit('HUB_ERROR', payload);
        }
    });

    socket.on('TUNNEL_URL', (payload) => {
        // Relay tunnel URL from Engine to all Dashboards
        if (socket.id === engineSocketId) {
            process.stdout.write(`[HUB] Relaying TUNNEL_URL: ${payload.url}\n`);
            socket.broadcast.emit('TUNNEL_URL', payload);
        }
    });

    socket.on('SERVER_LOG', (payload) => {
        // Relay console log from Engine to all Dashboards
        if (socket.id === engineSocketId) {
            socket.broadcast.emit('SERVER_LOG', payload);
        }
    });

    socket.on('SEND_COMMAND', (payload) => {
        // Relay command from Dashboard to Engine
        if (engineSocketId) {
            process.stdout.write(`[HUB] Relaying SEND_COMMAND: ${payload.command}\n`);
            io.to(engineSocketId).emit('SEND_COMMAND', payload);
        } else {
            socket.emit('HUB_ERROR', { message: 'Engine offline - cannot send command' });
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === engineSocketId) {
            process.stdout.write(`[HUB] Engine disconnected: ${socket.id}\n`);
            engineSocketId = null;
            io.emit('ENGINE_STATUS', { online: false });
            // Also broadcast that the server is effectively offline
            io.emit('SERVER_STATE', { state: 'offline' });
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    process.stdout.write(`[HUB] Server running on port ${PORT}\n`);
});
