# Zoom Recording Downloader

## Architecture
- **Hybrid architecture**: Desktop App (Phase 1) → Server + Web + Agent (Phase 2-3)
- **3-layer separation**: UI Layer / API Layer (IPC → HTTP later) / Service Layer
- UI never calls services directly — always through API layer (IPC now, REST/WebSocket later)
- Business logic in `src/services/` must NOT depend on Electron APIs

## Tech Stack
- Electron + Vite + React + TypeScript
- SQLite (better-sqlite3) — will migrate to PostgreSQL in Phase 2
- Zustand for state management
- Axios for HTTP (Zoom API)

## Project Structure
- `src/shared/` — Types & interfaces shared across all layers
- `src/services/` — Business logic (portable to server later)
- `src/database/` — Data access layer
- `src/ui/` — React UI (reusable for web later)
- `src/agent/` — Download Agent (Phase 3)
- `electron/` — Electron main process + IPC adapters

## Key Interfaces
All services implement interfaces from `src/shared/interfaces/`.
This allows swapping IPC ↔ HTTP transport without changing UI or business logic.

## Conventions
- Use TypeScript strict mode
- Service methods return Promises
- IPC channels follow pattern: `service:method` (e.g., `account:list`)
