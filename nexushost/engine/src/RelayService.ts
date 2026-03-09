// nexushost/engine/src/RelayService.ts
import net from 'net';
import { Socket } from 'socket.io';

export class RelayService {
    private sessions: Map<string, net.Socket> = new Map();

    constructor(private mcPort: number = 25565) {
        process.stdout.write(`[RELAY] Initializing Proxy to localhost:${this.mcPort}...\n`);
    }

    public handleNewSession(socket: Socket, sessionId: string) {
        // Create a new TCP connection to the local Minecraft Docker container
        const tcpSocket = net.connect({ port: this.mcPort, host: '127.0.0.1' }, () => {
            process.stdout.write(`[RELAY] Connected to local MC server for session ${sessionId}\n`);
        });

        // Store immediately so incoming RELAY_DATA_TO_HOST from Client can be buffered by Node.js
        this.sessions.set(sessionId, tcpSocket);

        tcpSocket.on('data', (data) => {
            // Forward data from Minecraft back to the Client App directly
            socket.emit('RELAY_DATA_FROM_HOST', { sessionId, data });
        });

        tcpSocket.on('close', () => {
            process.stdout.write(`[RELAY] MC Server closed connection for session ${sessionId}\n`);
            socket.emit('RELAY_CLOSE_FROM_HOST', { sessionId });
            this.sessions.delete(sessionId);
        });

        tcpSocket.on('error', (err) => {
            process.stdout.write(`[RELAY] TCP Proxy Error (${sessionId}): ${err.message}\n`);
            socket.emit('RELAY_CLOSE_FROM_HOST', { sessionId });
            this.sessions.delete(sessionId);
        });
    }

    public handleDataFromClient(sessionId: string, data: Buffer) {
        const tcpSocket = this.sessions.get(sessionId);
        if (tcpSocket && !tcpSocket.destroyed) {
            tcpSocket.write(data);
        }
    }

    public handleSessionCloseFromClient(sessionId: string) {
        const tcpSocket = this.sessions.get(sessionId);
        if (tcpSocket) {
            tcpSocket.destroy();
            this.sessions.delete(sessionId);
            process.stdout.write(`[RELAY] Closed local TCP socket for session ${sessionId}\n`);
        }
    }
}
