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
    RELAY_DATA_FROM_CLIENT: (payload: { sessionId: string, data: Buffer }) => void;
    RELAY_SESSION_CLOSE: (payload: { sessionId: string }) => void;
    ERROR: (payload: { message: string }) => void;
    NEXUS_ID: (payload: { id: string }) => void;
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
    RELAY_DATA_TO_CLIENT: (payload: { sessionId: string, data: Buffer }) => void;
    RELAY_SESSION_CLOSE: (payload: { sessionId: string }) => void;
}
export interface InterServerEvents {
    ping: () => void;
}

export interface SocketData {
    name: string;
    age: number;
}
