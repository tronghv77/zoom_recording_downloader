# Zoom Recording Downloader

## Architecture
- **Hybrid architecture**: Desktop App + Web Server + Download Agent
- **3-layer separation**: UI Layer / API Layer (IPC or HTTP) / Service Layer
- UI auto-detects mode: Electron (IPC) vs Browser (HTTP + WebSocket)
- Business logic in `src/services/` must NOT depend on Electron APIs

## Tech Stack
- Electron 41 + Vite + React + TypeScript
- sql.js (WASM SQLite — no native compilation needed)
- Express + WebSocket (server mode)
- Zustand for state management
- Axios for HTTP (Zoom API)

## Project Structure
- `src/shared/` — Types & interfaces shared across all layers
- `src/services/` — Business logic (portable: desktop & server)
- `src/database/` — Data access layer (sql.js + migrations)
- `src/ui/` — React UI (reusable for desktop & web)
- `src/agent/` — Download Agent (connects to server via WebSocket)
- `electron/` — Electron main process + IPC adapters
- `server/` — Express server + REST API + WebSocket

## Running
- Desktop: `scripts/start.cmd` (Windows) or `scripts/start.sh` (bash)
- Web Server: `scripts/start-server.cmd` → http://localhost:3000
- Download Agent: `scripts/start-agent.cmd ws://server:3000/ws "Device Name" "D:\Downloads"`
- IMPORTANT: VSCode sets ELECTRON_RUN_AS_NODE=1, scripts handle this automatically

## Building
- `npm run build` — Build Electron + Vite
- `npm run build:server` — Build Express server
- `npm run start` — Build all + launch Electron
- `npm run start:server` — Build all + launch web server

## Key Interfaces
All services implement interfaces from `src/shared/interfaces/`.
This allows swapping IPC ↔ HTTP transport without changing UI or business logic.

## Conventions
- Use TypeScript strict mode
- Service methods return Promises
- IPC channels follow pattern: `service:method` (e.g., `account:list`)
- REST API follows pattern: `GET/POST/PUT/DELETE /api/resource`
- Migrations in `src/database/migrations/` — numbered sequentially
