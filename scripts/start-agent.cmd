@echo off
REM === Zoom Recording Download Agent ===
REM Connects to central server and downloads files to this device
REM
REM Usage:
REM   start-agent.cmd --server ws://SERVER:3000/ws --name "My PC" --path "D:\ZoomRecordings"
REM
REM Options:
REM   --server   WebSocket URL of the server (default: ws://localhost:3000/ws)
REM   --name     Device name shown in web UI (default: computer name)
REM   --path     Download directory (default: .\downloads)
REM   --secret   Auth secret key (default: zoom-dl-agent-2026)

cd /d "%~dp0.."
node dist\server\src\agent\AgentClient.js %*
