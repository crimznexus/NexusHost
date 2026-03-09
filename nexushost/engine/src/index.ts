// nexushost/engine/src/index.ts – NexusHost Engine (Hub Integrated)
import { Server, Socket } from 'socket.io';
import Docker from 'dockerode';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import https from 'https';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
} from './types.js';
import natUpnp from 'nat-upnp';
import net from 'net';
import { RelayService } from './RelayService.js';
import { BridgeService } from './BridgeService.js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const PORT = 3001;
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(PORT, {
    cors: { origin: '*' }
});

let JOIN_ID = 'PENDING_TUNNEL';
let docker = new Docker();

// Initialize Services
const bridge = new BridgeService((line) => {
    io.emit('SERVER_LOG', { line });
});

// Try to determine if we need to fallback to TCP
async function getHealthyDocker(): Promise<Docker> {
    const d1 = new Docker();
    try {
        await d1.ping();
        return d1;
    } catch (e) {
        const d2 = new Docker({ host: '127.0.0.1', port: 2375 });
        try {
            await d2.ping();
            process.stdout.write(`[ENGINE] Connected to Docker via TCP:2375\n`);
            return d2;
        } catch (e2) {
            throw new Error('Docker daemon not found on default pipe or TCP:2375');
        }
    }
}

const CONTAINER_NAME = 'nexus-mc-server';
const IMAGE_NAME = 'itzg/minecraft-server:latest';
const MC_DATA_DIR = path.resolve('./mc-data');

if (!fs.existsSync(MC_DATA_DIR)) fs.mkdirSync(MC_DATA_DIR, { recursive: true });

const UPnP_PORT = 25565;
const upnpClient = natUpnp.createClient();

let heartbeatInterval: NodeJS.Timeout | null = null;
let containerObj: Docker.Container | null = null;
let isPortMapped = false;
let publicAddress: string | null = null;
let logStream: NodeJS.ReadableStream | null = null;

// Initialize Relay Service
const relayService = new RelayService(25565); // Connect to local Minecraft Docker container on 25565

process.stdout.write(`[ENGINE] Hub Server started on port ${PORT}\n`);

// Start Bridge on Startup
bridge.start(PORT).then(url => {
    if (url) {
        JOIN_ID = url;
        process.stdout.write(`[ENGINE] NEXUS-ID: ${JOIN_ID}\n`);
        fs.writeFileSync(path.resolve('./nexus_id.txt'), JOIN_ID);
        io.emit('TUNNEL_URL', { url: JOIN_ID });
        io.emit('NEXUS_ID', { id: JOIN_ID });
    }
});

// Handle Connections
io.on('connection', (socket: Socket) => {
    process.stdout.write(`[ENGINE] Client connected: ${socket.id}\n`);

    socket.on('DASHBOARD_CONNECT', async () => {
        process.stdout.write(`[ENGINE] Dashboard Attached: ${socket.id}\n`);

        socket.emit('NEXUS_ID', { id: JOIN_ID });

        // Push current state immediately
        try {
            docker = await getHealthyDocker();
            const containers = await docker.listContainers({ filters: { name: [CONTAINER_NAME] } });
            const state = (containers.length > 0 && containers[0].State === 'running') ? 'running' : 'offline';
            socket.emit('ENGINE_STATUS', { online: true });
            socket.emit('SERVER_STATE', { state });
            socket.emit('SERVER_LOG', { line: `Connected to Nexus Hub. JOIN_ID: ${JOIN_ID}` });
            if (publicAddress) socket.emit('TUNNEL_URL', { url: publicAddress });
        } catch (err) {
            process.stderr.write(`[ENGINE] Dashboard Connect Error: ${err}\n`);
            socket.emit('SERVER_STATE', { state: 'error' });
        }
    });

    socket.on('START_SERVER', async () => {
        await handleStartServer(socket);
    });

    socket.on('STOP_SERVER', async () => {
        await handleStopServer(socket);
    });

    socket.on('SEND_COMMAND', async ({ command }) => {
        await handleSendCommand(command, socket);
    });

    // Relay game traffic from Friend Client to Local Minecraft Server
    socket.on('RELAY_CONNECT', ({ sessionId }) => {
        relayService.handleNewSession(socket, sessionId);
    });

    socket.on('RELAY_DATA_TO_HOST', ({ sessionId, data }) => {
        relayService.handleDataFromClient(sessionId, data);
    });

    socket.on('RELAY_CLOSE_TO_HOST', ({ sessionId }) => {
        relayService.handleSessionCloseFromClient(sessionId);
    });
});

async function handleStartServer(socket: any) {
    try {
        io.emit('SERVER_STATE', { state: 'starting' });
        process.stdout.write(`[ENGINE] Starting Server Instance...\n`);

        const containers = await docker.listContainers({ all: true, filters: { name: [CONTAINER_NAME] } });
        if (containers.length > 0) {
            const existing = docker.getContainer(containers[0].Id);
            await existing.remove({ force: true });
        }

        containerObj = await docker.createContainer({
            Image: IMAGE_NAME,
            name: CONTAINER_NAME,
            Env: ['EULA=TRUE', 'TYPE=PAPER', 'MEMORY=2G', 'ONLINE_MODE=FALSE'],
            HostConfig: {
                PortBindings: { '25565/tcp': [{ HostPort: '25565' }] },
                Binds: [`${MC_DATA_DIR}:/data`]
            }
        });

        await containerObj.start();
        process.stdout.write(`[ENGINE] Docker server started\n`);

        startLogStream();
        startTunnel();
        io.emit('SERVER_STATE', { state: 'running' });
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Start failed: ${err.message}\n`);
        io.emit('SERVER_STATE', { state: 'error' });
        io.emit('ERROR', { message: `Start failed: ${err.message}` });
    }
}

async function handleStopServer(socket: any) {
    try {
        if (containerObj) {
            process.stdout.write(`[ENGINE] Stopping Docker container...\n`);
            await containerObj.stop().catch(() => { });
        }
        unmapPort();
        stopLogStream();
        io.emit('SERVER_STATE', { state: 'offline' });
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Stop failed: ${err.message}\n`);
    }
}

async function handleSendCommand(command: string, socket: any) {
    if (!containerObj) return;
    try {
        const exec = await containerObj.exec({
            Cmd: ['rcon-cli', command],
            AttachStdout: true,
            AttachStderr: true
        });
        await exec.start({});
    } catch (err: any) {
        socket.emit('ERROR', { message: `Command failed: ${err.message}` });
    }
}

async function sendContainerHeartbeat() {
    try {
        if (!containerObj) return;
        const stats = await containerObj.stats({ stream: false });
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuLoad = (systemDelta > 0 && cpuDelta > 0) ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

        io.emit('HEARTBEAT', {
            cpuLoad: cpuLoad,
            ramUsed: stats.memory_stats.usage,
            ramTotal: stats.memory_stats.limit,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        containerObj = null;
    }
}

setInterval(sendContainerHeartbeat, 2000);

async function startLogStream() {
    if (logStream || !containerObj) return;
    try {
        logStream = await containerObj.logs({ follow: true, stdout: true, stderr: true, tail: 100 });
        logStream.on('data', (chunk: Buffer) => {
            let offset = 0;
            while (offset < chunk.length) {
                if (chunk.length < offset + 8) break;
                const payloadSize = chunk.readUInt32BE(offset + 4);
                if (chunk.length < offset + 8 + payloadSize) break;
                const logLine = chunk.slice(offset + 8, offset + 8 + payloadSize).toString('utf8');
                logLine.split(/\r?\n/).forEach(line => {
                    if (line.trim()) io.emit('SERVER_LOG', { line });
                });
                offset += 8 + payloadSize;
            }
        });
    } catch (err: any) { }
}

function stopLogStream() { logStream = null; }

async function getExternalIp(): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data.trim()));
        }).on('error', (err) => reject(err));
    });
}

function unmapPort() {
    if (isPortMapped) {
        upnpClient.portUnmapping({ public: UPnP_PORT });
        isPortMapped = false;
    }
}

async function startTunnel() {
    try {
        const ip = await getExternalIp();
        publicAddress = `${ip}:${UPnP_PORT}`;
        upnpClient.portMapping({
            public: UPnP_PORT,
            private: UPnP_PORT,
            ttl: 0,
            description: 'NexusHost Minecraft Server'
        }, (err) => {
            if (!err) {
                isPortMapped = true;
                io.emit('TUNNEL_URL', { url: publicAddress! });
                io.emit('SERVER_LOG', { line: `Public Access (UPnP): ${publicAddress}` });
            }
        });
    } catch (err: any) { }
}

process.on('SIGINT', () => {
    unmapPort();
    process.exit();
});
