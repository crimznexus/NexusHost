// nexushost/dashboard/test_e2e_proxy.mjs
import net from 'net';
import fs from 'fs';
import { GameProxy } from './GameProxy.js';

// Read NEXUS-ID from Engine directory
const nexusId = fs.readFileSync('../engine/nexus_id.txt', 'utf8').trim();
console.log(`[TEST] Targeting NEXUS-ID: ${nexusId}`);

const proxy = new GameProxy();
proxy.start(nexusId);

setTimeout(() => {
    console.log('[TEST] Connecting "Fake Minecraft Client" to local proxy (127.0.0.1:25565)...');

    const client = new net.Socket();
    client.connect(25565, '127.0.0.1', () => {
        console.log('[TEST] Fake Game Connected to Proxy.');
        // Handshake packet for Minecraft
        const pingPacket = Buffer.from([0x0F, 0x00, 0x2F, 0x09, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x68, 0x6F, 0x73, 0x74, 0x63, 0xDD, 0x01, 0x01, 0x00]);
        console.log('[TEST] Sending Handshake Packet...');
        client.write(pingPacket);
    });

    client.on('data', (data) => {
        console.log(`[TEST] Received Data from Host via Proxy (${data.length} bytes):`);
        console.log(data);
        console.log('[TEST] TCP TUNNEL SUCCESSFUL! Closing test.');
        client.destroy();
        proxy.stop();
        process.exit(0);
    });

    client.on('close', () => {
        console.log('[TEST] Connection closed.');
        proxy.stop();
    });

    client.on('error', (err) => {
        console.error(`[TEST] Client Error: ${err.message}`);
        proxy.stop();
        process.exit(1);
    });
}, 3000); // give proxy time to connect to socket.io Hub
