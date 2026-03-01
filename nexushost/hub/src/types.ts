// nexushost/hub/src/types.ts

export interface HeartbeatPayload {
    cpuLoad: number;
    ramUsed: number;
    ramTotal: number;
    timestamp: string;
}

export interface EngineStatusPayload {
    online: boolean;
}

export type ServerState = 'offline' | 'starting' | 'running' | 'error';

export interface HubErrorPayload {
    message: string;
}

export interface ServerStatePayload {
    state: ServerState;
}

export interface ServerToClientEvents {
    HEARTBEAT: (payload: HeartbeatPayload) => void;
    ENGINE_STATUS: (payload: EngineStatusPayload) => void;
    HUB_ERROR: (payload: HubErrorPayload) => void;
    SERVER_STATE: (payload: ServerStatePayload) => void;
    TUNNEL_URL: (payload: { url: string }) => void;
    SERVER_LOG: (payload: { line: string }) => void;
    START_SERVER: () => void;
    STOP_SERVER: () => void;
    SEND_COMMAND: (payload: { command: string }) => void;
    TEST_START: () => void;
}

export interface ClientToServerEvents {
    ENGINE_CONNECT: () => void;
    DASHBOARD_CONNECT: () => void;
    HEARTBEAT: (payload: HeartbeatPayload) => void;
    START_SERVER: () => void;
    STOP_SERVER: () => void;
    SERVER_STATE: (payload: ServerStatePayload) => void;
    TUNNEL_URL: (payload: { url: string }) => void;
    SERVER_LOG: (payload: { line: string }) => void;
    SEND_COMMAND: (payload: { command: string }) => void;
    ERROR: (payload: { message: string }) => void;
}

// Socket data for Hub internal tracking
export interface InterServerEvents { }
export interface SocketData {
    type?: 'engine' | 'dashboard';
}
