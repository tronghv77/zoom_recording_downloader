import { spawn, ChildProcess } from 'child_process';

interface TrayCallbacks {
  onOpenSettings: () => void;
  onOpenWeb: () => void;
  onQuit: () => void;
}

let trayProcess: ChildProcess | null = null;

export function startTray(callbacks: TrayCallbacks): void {
  const parentPid = process.pid;

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$parentPid = ${parentPid}

# Create notify icon
$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Text = "Zoom Download Agent"
$icon.Visible = $true

# Create context menu
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemSettings = New-Object System.Windows.Forms.ToolStripMenuItem
$itemSettings.Text = "Mo Cai Dat"
$itemSettings.Add_Click({ Write-Host "TRAY:open-settings" })

$itemWeb = New-Object System.Windows.Forms.ToolStripMenuItem
$itemWeb.Text = "Mo Web Quan Ly"
$itemWeb.Add_Click({ Write-Host "TRAY:open-web" })

$sep = New-Object System.Windows.Forms.ToolStripSeparator

$itemQuit = New-Object System.Windows.Forms.ToolStripMenuItem
$itemQuit.Text = "Thoat"
$itemQuit.Add_Click({
  Write-Host "TRAY:quit"
  $icon.Visible = $false
  $icon.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$menu.Items.AddRange(@($itemSettings, $itemWeb, $sep, $itemQuit))
$icon.ContextMenuStrip = $menu

# Double-click opens settings
$icon.Add_DoubleClick({ Write-Host "TRAY:open-settings" })

# Timer to check if parent process still alive
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
  try {
    $p = Get-Process -Id $parentPid -ErrorAction Stop
  } catch {
    $icon.Visible = $false
    $icon.Dispose()
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

# Run message loop
[System.Windows.Forms.Application]::Run()
`;

  try {
    trayProcess = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript,
    ], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    trayProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        const cmd = line.trim();
        if (cmd === 'TRAY:open-settings') callbacks.onOpenSettings();
        else if (cmd === 'TRAY:open-web') callbacks.onOpenWeb();
        else if (cmd === 'TRAY:quit') callbacks.onQuit();
      }
    });

    trayProcess.on('error', () => {
      console.log('[Tray] PowerShell not available, running without tray icon');
    });

    trayProcess.on('exit', () => {
      trayProcess = null;
    });
  } catch {
    console.log('[Tray] Failed to start tray icon');
  }
}

export function stopTray(): void {
  if (trayProcess) {
    trayProcess.kill();
    trayProcess = null;
  }
}
