import { io } from 'socket.io-client';
import fs from 'fs';

const NEXUS_ID = fs.readFileSync('nexus_id.txt', 'utf8').trim();
console.log(`[TEST CLIENT] Waiting to pair with NEXUS-ID: ${NEXUS_ID}`);

// For local testing, we bypass the Playit tunnel and connect directly.
// The dashboard URL would dynamically change to the tunnel in a real scenario.
const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('[TEST CLIENT] Connected to Engine Hub!');

    socket.emit('DASHBOARD_CONNECT');
});

socket.on('ENGINE_STATUS', ({ online }) => {
    console.log(`[TEST CLIENT] Handshake successful, Engine Status Online: ${online}`);

    // Test Remote Start
    console.log('[TEST CLIENT] Sending Remote Start Command...');
    socket.emit('START_SERVER');
});

socket.on('SERVER_STATE', ({ state }) => {
    console.log(`[TEST CLIENT] Server State update received: ${state}`);
    if (state === 'running') {
        console.log('[TEST CLIENT] Server is running. Sending test command...');
        socket.emit('SEND_COMMAND', { command: 'say Hello from Client!' });
    }
});

let logCount = 0;
socket.on('SERVER_LOG', ({ line }) => {
    console.log(`[STDOUT] ${line}`);
    logCount++;
    if (logCount > 5 && line.includes('Done')) {
        console.log('[TEST CLIENT] Successfully streamed initial boot logs.');
        console.log('[TEST CLIENT] Sending STOP command...');
        socket.emit('STOP_SERVER');
    }
    if (line.includes('Stopping server') || line.includes('Saving chunks')) {
        console.log('[TEST CLIENT] Server stopping correctly.');
    }
    if (line.includes('Docker server stopped') || line.includes('Server Error') || line.includes('Stopped')) {
        console.log('[TEST CLIENT] Tests finished, disconnecting.');
        socket.disconnect();
        process.exit(0);
    }
});

socket.on('ERROR', ({ message }) => {
    console.error(`[TEST CLIENT] ERROR event: ${message}`);
    process.exit(1);
});

socket.on('HUB_ERROR', ({ message }) => {
    console.error(`[TEST CLIENT] HUB_ERROR event: ${message}`);
    process.exit(1);
});

// timeout fallback
setTimeout(() => {
    console.log('[TEST CLIENT] Timeout reached. Ending test.');
    process.exit(1);
}, 60000);
