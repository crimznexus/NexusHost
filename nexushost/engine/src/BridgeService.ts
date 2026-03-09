// nexushost/engine/src/BridgeService.ts
import localtunnel from 'localtunnel';

export class BridgeService {
    private tunnel: localtunnel.Tunnel | null = null;
    public url: string | null = null;

    constructor(private onLog: (line: string) => void) { }

    public async start(port: number): Promise<string | null> {
        this.onLog(`[BRIDGE] Initializing Nexus Bridge via Localtunnel on port ${port}...`);

        try {
            this.tunnel = await localtunnel({ port });

            this.tunnel.on('close', () => {
                this.onLog('[BRIDGE] Tunnel closed.');
            });

            this.tunnel.on('error', (err: Error) => {
                this.onLog(`[BRIDGE] Tunnel error: ${err.message}`);
            });

            this.url = this.tunnel.url;
            this.onLog(`[BRIDGE] Nexus Bridge is LIVE at ${this.url}`);

            return this.url;
        } catch (err: any) {
            this.onLog(`[BRIDGE] Failed to start tunnel: ${err.message}`);
            return null;
        }
    }

    public stop() {
        if (this.tunnel) {
            this.tunnel.close();
            this.tunnel = null;
            this.url = null;
            this.onLog('[BRIDGE] Tunnel forcibly closed.');
        }
    }
}
