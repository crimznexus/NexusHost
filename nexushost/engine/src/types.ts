// nexushost/engine/src/types.ts
export interface HeartbeatPayload {
    cpuLoad: number;
    ramUsed: number;
    ramTotal: number;
    timestamp: string;
}

export interface EngineStatusPayload {
    online: boolean;
}

export interface HubErrorPayload {
    message: string;
}

export type ServerState = 'offline' | 'starting' | 'running' | 'error';

export interface ServerStatePayload {
    state: ServerState;
}

export interface ServerToClientEvents {
    ENGINE_STATUS: (payload: EngineStatusPayload) => void;
    HUB_ERROR: (payload: HubErrorPayload) => void;
    START_SERVER: () => void;
    STOP_SERVER: () => void;
    SEND_COMMAND: (payload: { command: string }) => void;
}

export interface ClientToServerEvents {
    ENGINE_CONNECT: () => void;
    HEARTBEAT: (payload: HeartbeatPayload) => void;
    SERVER_STATE: (payload: ServerStatePayload) => void;
    TUNNEL_URL: (payload: { url: string }) => void;
    SERVER_LOG: (payload: { line: string }) => void;
    ERROR: (payload: { message: string }) => void;
}
