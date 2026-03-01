// nexushost/engine/src/index.ts – NexusHost Engine
import { io, Socket } from 'socket.io-client';
import Docker from 'dockerode';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess, execSync } from 'child_process';
import https from 'https';
import {
    ClientToServerEvents,
    ServerToClientEvents
} from './types.js';

dotenv.config();

const HUB_URL = process.env.HUB_URL || 'http://localhost:3001';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(HUB_URL);
const docker = new Docker();

const CONTAINER_NAME = 'nexus-mc-server';
const IMAGE_NAME = 'itzg/minecraft-server:latest';
const MC_DATA_DIR = path.resolve('./mc-data');

// Ensure data directory exists
if (!fs.existsSync(MC_DATA_DIR)) {
    fs.mkdirSync(MC_DATA_DIR, { recursive: true });
}

const PLAYIT_EXE = path.resolve('playit.exe');
const PLAYIT_URL = 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64-signed.exe';

let heartbeatInterval: NodeJS.Timeout | null = null;
let containerObj: Docker.Container | null = null;
let tunnelProcess: ChildProcess | null = null;
let logStream: NodeJS.ReadableStream | null = null;

socket.on('connect', async () => {
    process.stdout.write(`[ENGINE] Connected to Hub: ${socket.id}\n`);
    socket.emit('ENGINE_CONNECT');

    // Health Check: Validate Docker daemon
    try {
        await docker.ping();
        process.stdout.write(`[ENGINE] Docker daemon is healthy\n`);
        socket.emit('SERVER_STATE', { state: 'offline' });

        // Check if container is already running and attach logs if so
        const containers = await docker.listContainers({ filters: { name: [CONTAINER_NAME] } });
        if (containers.length > 0 && containers[0].State === 'running') {
            containerObj = docker.getContainer(containers[0].Id);
            startLogStream();
            socket.emit('SERVER_STATE', { state: 'running' });
        }
    } catch (err) {
        process.stdout.write(`[ENGINE] Docker Not Found: ${err}\n`);
        socket.emit('SERVER_STATE', { state: 'error' });
        socket.emit('ERROR', { message: 'Docker Not Found - check if Docker Desktop is running' });
    }

    // Start heartbeat loop (polling container stats)
    heartbeatInterval = setInterval(sendContainerHeartbeat, 2000);
});

async function sendContainerHeartbeat() {
    try {
        if (!containerObj) {
            const containers = await docker.listContainers({ all: true, filters: { name: [CONTAINER_NAME] } });
            if (containers.length > 0) {
                containerObj = docker.getContainer(containers[0].Id);
            }
        }

        if (!containerObj) return;

        const stats = await containerObj.stats({ stream: false });

        // CPU calculation logic
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuLoad = (systemDelta > 0 && cpuDelta > 0) ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

        const payload = {
            cpuLoad: cpuLoad,
            ramUsed: stats.memory_stats.usage,
            ramTotal: stats.memory_stats.limit,
            timestamp: new Date().toISOString()
        };

        socket.emit('HEARTBEAT', payload);
    } catch (err) {
        containerObj = null;
    }
}

async function startLogStream() {
    if (logStream || !containerObj) return;

    try {
        logStream = await containerObj.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: 100
        });

        logStream.on('data', (chunk: Buffer) => {
            // Docker logs are multiplexed with a header (8 bytes)
            // Header: [stream type, 0, 0, 0, size1, size2, size3, size4]
            // We'll just strip it for now as we want the text
            let offset = 0;
            while (offset < chunk.length) {
                const payloadSize = chunk.readUInt32BE(offset + 4);
                const logLine = chunk.slice(offset + 8, offset + 8 + payloadSize).toString('utf8');

                // Split by lines and emit
                logLine.split(/\r?\n/).forEach(line => {
                    if (line.trim()) {
                        socket.emit('SERVER_LOG', { line });
                    }
                });

                offset += 8 + payloadSize;
            }
        });

        logStream.on('error', (err) => {
            process.stdout.write(`[ENGINE] Log stream error: ${err.message}\n`);
            logStream = null;
        });

    } catch (err: any) {
        process.stdout.write(`[ENGINE] Failed to attach to logs: ${err.message}\n`);
    }
}

function stopLogStream() {
    if (logStream) {
        // There isn't a direct "destroy" but we can stop listening
        logStream = null;
    }
}

function stopTunnel() {
    if (tunnelProcess) {
        process.stdout.write(`[ENGINE] Killing playit process...\n`);
        tunnelProcess.kill();
        tunnelProcess = null;
    }
}

async function ensurePlayit(): Promise<string> {
    const isBinaryValid = fs.existsSync(PLAYIT_EXE) && fs.statSync(PLAYIT_EXE).size > 1000000;
    if (isBinaryValid) return PLAYIT_EXE;

    try {
        execSync('playit --version', { stdio: 'ignore' });
        return 'playit';
    } catch (e) { }

    process.stdout.write(`[ENGINE] playit missing or corrupt. Downloading from GitHub...\n`);
    socket.emit('SERVER_LOG', { line: 'Playit.gg missing. Downloading binary (~15MB)...' });

    const download = (url: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return download(res.headers.location!).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`Download failed with status ${res.statusCode}`));
                }

                const file = fs.createWriteStream(PLAYIT_EXE);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', reject);
        });
    };

    try {
        await download(PLAYIT_URL);
        const finalSize = fs.statSync(PLAYIT_EXE).size;
        if (finalSize < 1000000) {
            throw new Error(`Download incomplete or invalid format (size: ${finalSize} bytes)`);
        }
        process.stdout.write(`[ENGINE] Download complete (${(finalSize / 1024 / 1024).toFixed(1)} MB).\n`);
        return PLAYIT_EXE;
    } catch (err: any) {
        if (fs.existsSync(PLAYIT_EXE)) fs.unlinkSync(PLAYIT_EXE);
        throw err;
    }
}

async function startTunnel() {
    stopTunnel();

    try {
        const binPath = await ensurePlayit();
        process.stdout.write(`[ENGINE] Starting Playit Tunnel using ${binPath}...\n`);

        // Use --secret_path to keep it portable in the engine folder
        const secretPath = path.resolve('playit.secret');
        tunnelProcess = spawn(binPath, ['--secret_path', secretPath, '--stdout', 'start']);

        const handleData = (data: Buffer) => {
            const output = data.toString();

            // 1. Capture Claim URL (if not linked)
            const claimMatch = output.match(/https:\/\/playit\.gg\/claim\/[a-z0-9-]+/i);
            if (claimMatch) {
                const url = claimMatch[0];
                process.stdout.write(`[ENGINE] Playit Claim Required: ${url}\n`);
                socket.emit('TUNNEL_URL', { url });
                socket.emit('SERVER_LOG', { line: `Action Required: Link your tunnel at ${url}` });
            }

            // 2. Capture Active Address
            // Example: "address: something.playit.gg" or "tunnels: ... -> something.at.playit.gg:12345"
            const addrMatch = output.match(/([a-z0-9-]+\.at\.playit\.gg:[0-9]+)/i);
            if (addrMatch) {
                const url = addrMatch[1];
                process.stdout.write(`[ENGINE] Public Address Active: ${url}\n`);
                socket.emit('TUNNEL_URL', { url });
            }
        };

        tunnelProcess.stdout?.on('data', handleData);
        tunnelProcess.stderr?.on('data', handleData);

        tunnelProcess.on('error', (err) => {
            process.stdout.write(`[ENGINE] playit failed to start: ${err.message}\n`);
            socket.emit('ERROR', { message: 'Failed to start playit tunnel' });
        });
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Playit setup failed: ${err.message}\n`);
        socket.emit('ERROR', { message: `Playit setup failed: ${err.message}` });
    }
}

socket.on('START_SERVER', async () => {
    try {
        socket.emit('SERVER_STATE', { state: 'starting' });
        process.stdout.write(`[ENGINE] Starting Provisioning...\n`);

        const images = await docker.listImages({ filters: { reference: [IMAGE_NAME] } });
        if (images.length === 0) {
            process.stdout.write(`[ENGINE] Pulling image: ${IMAGE_NAME}\n`);
            await new Promise((resolve, reject) => {
                docker.pull(IMAGE_NAME, (err: any, stream: any) => {
                    if (err) return reject(err);
                    docker.modem.followProgress(stream, (err: any) => err ? reject(err) : resolve(true));
                });
            });
        }

        const containers = await docker.listContainers({ all: true, filters: { name: [CONTAINER_NAME] } });
        if (containers.length > 0) {
            const existing = docker.getContainer(containers[0].Id);
            await existing.remove({ force: true });
        }

        containerObj = await docker.createContainer({
            Image: IMAGE_NAME,
            name: CONTAINER_NAME,
            Env: ['EULA=TRUE', 'TYPE=PAPER', 'MEMORY=2G'],
            HostConfig: {
                PortBindings: { '25565/tcp': [{ HostPort: '25565' }] },
                Binds: [`${MC_DATA_DIR}:/data`]
            }
        });

        await containerObj.start();
        process.stdout.write(`[ENGINE] Docker server started\n`);

        // Start log streaming
        startLogStream();

        // Start automated tunnel
        startTunnel();

        socket.emit('SERVER_STATE', { state: 'running' });
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Start failed: ${err.message}\n`);
        socket.emit('SERVER_STATE', { state: 'error' });
        socket.emit('ERROR', { message: `Start failed: ${err.message}` });
    }
});

socket.on('STOP_SERVER', async () => {
    try {
        if (containerObj) {
            process.stdout.write(`[ENGINE] Stopping Docker container...\n`);
            await containerObj.stop();
        }

        // Auto-cleanup tunnel and logs
        stopTunnel();
        stopLogStream();

        socket.emit('SERVER_STATE', { state: 'offline' });
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Stop failed: ${err.message}\n`);
        socket.emit('ERROR', { message: `Stop failed: ${err.message}` });
    }
});

socket.on('SEND_COMMAND', async ({ command }) => {
    if (!containerObj) return;

    try {
        process.stdout.write(`[ENGINE] Sending command to Minecraft: ${command}\n`);
        const exec = await containerObj.exec({
            Cmd: ['rcon-cli', command],
            AttachStdout: true,
            AttachStderr: true
        });
        await exec.start({});
    } catch (err: any) {
        process.stdout.write(`[ENGINE] Command failed: ${err.message}\n`);
        socket.emit('ERROR', { message: `Command failed: ${err.message}` });
    }
});

// Clean up everything on exit
process.on('SIGINT', () => {
    stopTunnel();
    process.exit();
});

socket.on('disconnect', () => {
    process.stdout.write(`[ENGINE] Disconnected from Hub\n`);
    stopTunnel();
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
});

socket.on('connect_error', (error) => {
    process.stdout.write(`[ENGINE] Connection error: ${error.message}\n`);
});
