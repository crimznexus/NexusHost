// nexushost/dashboard/src/types.ts
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

export interface ServerToClientEvents {
    HEARTBEAT: (payload: HeartbeatPayload) => void;
    ENGINE_STATUS: (payload: EngineStatusPayload) => void;
    HUB_ERROR: (payload: HubErrorPayload) => void;
    TEST_START: () => void;
}

export interface ClientToServerEvents {
    DASHBOARD_CONNECT: () => void;
    TEST_START: () => void;
}
