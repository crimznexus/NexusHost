// nexushost/dashboard/GameProxy.js
import net from 'net';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

export class GameProxy {
    constructor() {
        this.tcpServer = null;
        this.socket = null;
        this.sessions = new Map();
        this.mcPort = 25565;
    }

    start(hubUrl) {
        if (this.socket) {
            this.socket.disconnect();
        }
        if (this.tcpServer) {
            this.tcpServer.close();
        }

        console.log(`[PROXY] Connecting WebSocket to Hub: ${hubUrl}`);
        this.socket = io(hubUrl, { transports: ['websocket'] });

        this.socket.on('connect', () => {
            console.log(`[PROXY] Connected to Host Hub via WebSocket.`);
            if (!this.tcpServer) {
                this.startTcpListener();
            }
        });

        this.socket.on('disconnect', () => {
            console.log(`[PROXY] Disconnected from Host Hub.`);
            this.clearSessions();
            if (this.tcpServer) {
                this.tcpServer.close();
                this.tcpServer = null;
            }
        });

        this.socket.on('RELAY_DATA_FROM_HOST', ({ sessionId, data }) => {
            const tcpSocket = this.sessions.get(sessionId);
            if (tcpSocket && !tcpSocket.destroyed) {
                tcpSocket.write(data);
            }
        });

        this.socket.on('RELAY_CLOSE_FROM_HOST', ({ sessionId }) => {
            const tcpSocket = this.sessions.get(sessionId);
            if (tcpSocket) {
                tcpSocket.destroy();
                this.sessions.delete(sessionId);
                console.log(`[PROXY] Host closed session ${sessionId}`);
            }
        });
    }

    startTcpListener() {
        this.tcpServer = net.createServer((tcpSocket) => {
            const sessionId = uuidv4();
            console.log(`[PROXY] New local game connection. Session ID: ${sessionId}`);
            this.sessions.set(sessionId, tcpSocket);

            if (this.socket && this.socket.connected) {
                this.socket.emit('RELAY_CONNECT', { sessionId });
            } else {
                console.log(`[PROXY] Rejected connection: Not connected to Host`);
                tcpSocket.destroy();
                return;
            }

            tcpSocket.on('data', (data) => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('RELAY_DATA_TO_HOST', { sessionId, data });
                }
            });

            tcpSocket.on('close', () => {
                console.log(`[PROXY] Game closed session ${sessionId}`);
                if (this.socket && this.socket.connected) {
                    this.socket.emit('RELAY_CLOSE_TO_HOST', { sessionId });
                }
                this.sessions.delete(sessionId);
            });

            tcpSocket.on('error', (err) => {
                console.log(`[PROXY] TCP Error (${sessionId}): ${err.message}`);
                tcpSocket.destroy();
                this.sessions.delete(sessionId);
            });
        });

        this.tcpServer.on('error', (err) => {
            console.error(`[PROXY] Server Error: ${err.message}`);
            if (err.code === 'EADDRINUSE') {
                console.error(`[PROXY] Port ${this.mcPort} is already in use.`);
            }
        });

        this.tcpServer.listen(this.mcPort, '127.0.0.1', () => {
            console.log(`[PROXY] Ready! Listening for game traffic on 127.0.0.1:${this.mcPort}`);
        });
    }

    clearSessions() {
        for (const [id, socket] of this.sessions.entries()) {
            socket.destroy();
        }
        this.sessions.clear();
    }

    stop() {
        this.clearSessions();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        if (this.tcpServer) {
            this.tcpServer.close();
            this.tcpServer = null;
        }
        console.log('[PROXY] Proxy completely stopped.');
    }
}
