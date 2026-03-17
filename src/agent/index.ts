// Phase 3: Download Agent entry point
// This will be a standalone lightweight process that:
// 1. Connects to the central server via WebSocket
// 2. Receives download commands
// 3. Downloads files to local disk
// 4. Reports progress back to server
//
// Usage: node agent.js --server ws://server:3000 --name "My PC" --download-path "D:/Zoom"

export { AgentClient } from './AgentClient';
