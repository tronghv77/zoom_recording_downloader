@echo off
REM Start the Download Agent (Phase 3 - connects to server)
REM Usage: start-agent.cmd [server-url] [device-name] [download-path]
REM Example: start-agent.cmd ws://192.168.1.100:3000/ws "My PC" "D:\ZoomDownloads"
cd /d "%~dp0.."
set SERVER_URL=%1
set DEVICE_NAME=%2
set DOWNLOAD_PATH=%3
if "%SERVER_URL%"=="" set SERVER_URL=ws://localhost:3000/ws
if "%DEVICE_NAME%"=="" set DEVICE_NAME=Agent-%COMPUTERNAME%
if "%DOWNLOAD_PATH%"=="" set DOWNLOAD_PATH=downloads
node dist\server\src\agent\AgentClient.js %SERVER_URL% %DEVICE_NAME% %DOWNLOAD_PATH%
