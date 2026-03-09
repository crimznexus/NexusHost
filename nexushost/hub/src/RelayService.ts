// nexushost/hub/src/RelayService.ts
import net from 'net';
import { Server } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class RelayService {
    private tcpServer: net.Server;
    private sessions: Map<string, net.Socket> = new Map();

    constructor(
        private io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
        private getEngineSocketId: () => string | null
    ) {
        process.stdout.write(`[RELAY] Initializing RelayService...\n`);
        this.tcpServer = net.createServer((socket) => {
            const sessionId = uuidv4();
            const engineId = this.getEngineSocketId();

            if (!engineId) {
                process.stdout.write(`[RELAY] Rejected connection: Engine offline\n`);
                socket.destroy();
                return;
            }

            process.stdout.write(`[RELAY] New session: ${sessionId}\n`);
            this.sessions.set(sessionId, socket);

            // Notify Engine of new session
            this.io.to(engineId).emit('SERVER_LOG', { line: `Relay: New connection (ID: ${sessionId.split('-')[0]})` });

            socket.on('data', (data) => {
                const refreshedEngineId = this.getEngineSocketId();
                if (refreshedEngineId) {
                    this.io.to(refreshedEngineId).emit('RELAY_DATA_FROM_CLIENT', { sessionId, data });
                }
            });

            socket.on('close', () => {
                process.stdout.write(`[RELAY] Session closed: ${sessionId}\n`);
                this.sessions.delete(sessionId);
                const refreshedEngineId = this.getEngineSocketId();
                if (refreshedEngineId) {
                    this.io.to(refreshedEngineId).emit('RELAY_SESSION_CLOSE', { sessionId });
                }
            });

            socket.on('error', (err) => {
                process.stdout.write(`[RELAY] Session error (${sessionId}): ${err.message}\n`);
            });
        });
    }

    public start(port: number = 25565) {
        console.log(`[RELAY] Starting TCP Listener on port ${port}...`);

        this.tcpServer.on('error', (err: any) => {
            console.log(`[RELAY] TCP Server Error: ${err.message}`);
            if (err.code === 'EADDRINUSE') {
                console.log(`[RELAY] Port ${port} is already in use. Please use a different port for the relay.`);
            }
        });

        this.tcpServer.listen(port, '0.0.0.0', () => {
            console.log(`[RELAY] TCP Listener active on port ${port}`);
        });
    }

    public handleDataFromEngine(sessionId: string, data: Buffer) {
        const socket = this.sessions.get(sessionId);
        if (socket) {
            socket.write(data);
        }
    }

    public handleSessionCloseFromEngine(sessionId: string) {
        const socket = this.sessions.get(sessionId);
        if (socket) {
            socket.destroy();
            this.sessions.delete(sessionId);
        }
    }
}
