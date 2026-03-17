@echo off
REM Start the web server (Phase 2 - Hybrid mode)
REM Access at http://localhost:3000
cd /d "%~dp0.."
node dist\server\server\index.js
