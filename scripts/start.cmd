@echo off
REM Launch Electron app from Windows CMD/PowerShell
REM Unsets ELECTRON_RUN_AS_NODE which VSCode sets and breaks Electron
cd /d "%~dp0.."
set ELECTRON_RUN_AS_NODE=
node_modules\.bin\electron.cmd .
