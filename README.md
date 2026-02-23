# NexusHost | Phase I: The Nexus Connection

NexusHost is a modern, real-time game server hosting dashboard. **Phase I: The Nexus Connection** establishes a robust, bidirectional heartbeat system between a remote Windows Engine and a central Hub.

## 🏗️ Architecture

The system consists of three distinct components:

1.  **Hub (`/nexushost/hub`)**: A central message broker implemented with Node.js, Express, and Socket.io. It validates incoming telemetry and relays state to the Dashboard.
2.  **Engine (`/nexushost/engine`)**: A headless Node.js client running on the target Windows machine. It uses the `systeminformation` package to collect real-time hardware stats (CPU Load, RAM Usage) and streams them to the Hub.
3.  **Dashboard (`/nexushost/dashboard`)**: A premium React 19 UI built with Vite, Tailwind CSS, and Lucide icons. It displays live hardware gauges and provides an interface for remote commands.

## 🚀 Getting Started

### Prerequisites

- Node.js v24+ LTS
- Windows environment (for Engine stats collection)

### 1. Hub Setup
```bash
cd nexushost/hub
npm install
npm run dev
```
*Server runs on `http://localhost:3001`.*

### 2. Dashboard Setup
```bash
cd nexushost/dashboard
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

### 3. Engine Setup
```bash
cd nexushost/engine
npm install
npm run dev
```
*Stats collection begins and streams to the Hub.*

## 📡 Event Contract

| Event | Direction | Payload |
|---|---|---|
| `ENGINE_CONNECT` | Engine → Hub | - |
| `DASHBOARD_CONNECT`| Dashboard → Hub | - |
| `HEARTBEAT` | Engine → Hub → Dashboard | `{ cpuLoad, ramUsed, ramTotal, timestamp }` |
| `TEST_START` | Dashboard → Hub → Engine | - |
| `ENGINE_STATUS` | Hub → Dashboard | `{ online: boolean }` |

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Socket.io-client
- **Backend**: Node.js, Express.js, Socket.io
- **Hardware Stats**: `systeminformation`
- **Language**: TypeScript (Strict Mode)

---
*Created by Antigravity for crimznexus.*
