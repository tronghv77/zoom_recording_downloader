/**
 * Embedded HTML/CSS/JS for the Agent Settings UI
 * Served by AgentServer on localhost:17710
 */

export function getSettingsHTML(): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zoom Agent</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 20px;
  }
  .container { max-width: 600px; width: 100%; }

  /* Header */
  .header {
    text-align: center;
    padding: 24px 0 16px;
  }
  .header h1 {
    font-size: 22px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }
  .header .version {
    font-size: 13px;
    color: #888;
  }

  /* Status Badge */
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px;
    background: #16213e;
    border-radius: 10px;
    margin-bottom: 20px;
  }
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #666;
    animation: pulse 2s infinite;
  }
  .status-dot.connected { background: #00c853; }
  .status-dot.disconnected { background: #ff1744; }
  .status-dot.connecting { background: #ffc107; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .status-text {
    font-size: 14px;
    font-weight: 500;
  }
  .status-device {
    font-size: 13px;
    color: #888;
    margin-left: auto;
  }

  /* Cards */
  .card {
    background: #16213e;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
  }

  /* Form */
  .form-group {
    margin-bottom: 14px;
  }
  .form-group label {
    display: block;
    font-size: 13px;
    color: #999;
    margin-bottom: 6px;
  }
  .form-group input {
    width: 100%;
    padding: 10px 14px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }
  .form-group input:focus {
    border-color: #533483;
  }

  /* Buttons */
  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .btn:hover { filter: brightness(1.15); }
  .btn:active { transform: scale(0.98); }

  .btn-primary {
    background: #533483;
    color: #fff;
    width: 100%;
    justify-content: center;
  }
  .btn-row {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }
  .btn-secondary {
    background: #0f3460;
    color: #e0e0e0;
    flex: 1;
    justify-content: center;
  }
  .btn-success {
    background: #1b5e20;
    color: #fff;
    flex: 1;
    justify-content: center;
  }

  /* Toast */
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    color: #fff;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s;
    z-index: 100;
  }
  .toast.show {
    opacity: 1;
    transform: translateY(0);
  }
  .toast.success { background: #1b5e20; }
  .toast.error { background: #b71c1c; }
  .toast.info { background: #0f3460; }

  /* Downloads */
  .download-item {
    padding: 10px 0;
    border-bottom: 1px solid #1a3a5c;
  }
  .download-item:last-child { border-bottom: none; }
  .download-name {
    font-size: 13px;
    color: #ccc;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .progress-bar {
    width: 100%;
    height: 6px;
    background: #0f3460;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #533483;
    border-radius: 3px;
    transition: width 0.3s;
  }
  .download-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #888;
    margin-top: 4px;
  }
  .empty-text {
    text-align: center;
    color: #666;
    font-size: 13px;
    padding: 10px 0;
  }

  /* Update banner */
  .update-banner {
    background: #1b5e20;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
    display: none;
  }
  .update-banner.show { display: block; }
  .update-banner a {
    color: #81c784;
    text-decoration: underline;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Zoom Download Agent</h1>
    <div class="version" id="version">v0.0.0</div>
  </div>

  <!-- Status -->
  <div class="status-bar">
    <div class="status-dot" id="statusDot"></div>
    <span class="status-text" id="statusText">Dang ket noi...</span>
    <span class="status-device" id="statusDevice"></span>
  </div>

  <!-- Update Banner -->
  <div class="update-banner" id="updateBanner">
    <span id="updateText"></span>
  </div>

  <!-- Settings -->
  <div class="card">
    <div class="card-title">Cai Dat</div>
    <div class="form-group">
      <label>Ten thiet bi</label>
      <input type="text" id="deviceName" placeholder="VD: Laptop Van Phong">
    </div>
    <div class="form-group">
      <label>Thu muc tai ve</label>
      <input type="text" id="downloadPath" placeholder="VD: D:\\\\ZoomRecordings">
    </div>
    <div class="form-group">
      <label>Server URL</label>
      <input type="text" id="serverUrl" placeholder="wss://...">
    </div>
    <div class="form-group">
      <label>Secret Key</label>
      <input type="password" id="secret" placeholder="Secret key">
    </div>
    <button class="btn btn-primary" onclick="saveConfig()">Luu Cau Hinh</button>
  </div>

  <!-- Actions -->
  <div class="card">
    <div class="card-title">Hanh Dong</div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="openWeb()">Mo Web Quan Ly</button>
      <button class="btn btn-success" onclick="checkUpdate()">Kiem Tra Cap Nhat</button>
    </div>
  </div>

  <!-- Downloads -->
  <div class="card">
    <div class="card-title">Dang Tai (<span id="downloadCount">0</span>)</div>
    <div id="downloadList">
      <div class="empty-text">Khong co file nao dang tai</div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
  // ===== Toast =====
  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  // ===== Load Config =====
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      document.getElementById('deviceName').value = cfg.deviceName || '';
      document.getElementById('downloadPath').value = cfg.downloadPath || '';
      document.getElementById('serverUrl').value = cfg.serverUrl || '';
      document.getElementById('secret').value = cfg.secret || '';
    } catch(e) { console.error('Load config error:', e); }
  }

  // ===== Save Config =====
  async function saveConfig() {
    const cfg = {
      deviceName: document.getElementById('deviceName').value,
      downloadPath: document.getElementById('downloadPath').value,
      serverUrl: document.getElementById('serverUrl').value,
      secret: document.getElementById('secret').value
    };
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      const result = await res.json();
      if (result.ok) {
        showToast('Da luu cau hinh! Dang ket noi lai...', 'success');
      } else {
        showToast('Loi: ' + result.error, 'error');
      }
    } catch(e) {
      showToast('Khong the luu cau hinh', 'error');
    }
  }

  // ===== Open Web =====
  async function openWeb() {
    try {
      await fetch('/api/open-web', { method: 'POST' });
    } catch(e) {
      showToast('Khong the mo trinh duyet', 'error');
    }
  }

  // ===== Check Update =====
  async function checkUpdate() {
    try {
      const res = await fetch('/api/check-update');
      const info = await res.json();
      const banner = document.getElementById('updateBanner');
      const text = document.getElementById('updateText');
      if (info.hasUpdate) {
        text.innerHTML = 'Phien ban moi: v' + info.latestVersion +
          ' — <a href="' + info.downloadUrl + '" target="_blank">Tai ve</a>';
        banner.classList.add('show');
        showToast('Co phien ban moi!', 'info');
      } else {
        banner.classList.remove('show');
        showToast('Ban dang su dung phien ban moi nhat', 'success');
      }
    } catch(e) {
      showToast('Khong the kiem tra cap nhat', 'error');
    }
  }

  // ===== Poll Status =====
  async function pollStatus() {
    try {
      const res = await fetch('/api/status');
      const s = await res.json();

      // Version
      document.getElementById('version').textContent = 'v' + s.version;

      // Connection status
      const dot = document.getElementById('statusDot');
      const txt = document.getElementById('statusText');
      dot.className = 'status-dot ' + s.connectionStatus;
      const labels = { connected: 'Da ket noi', disconnected: 'Mat ket noi', connecting: 'Dang ket noi...' };
      txt.textContent = labels[s.connectionStatus] || s.connectionStatus;

      // Device name
      document.getElementById('statusDevice').textContent = s.deviceName || '';

      // Downloads
      const list = document.getElementById('downloadList');
      const count = document.getElementById('downloadCount');
      if (s.downloads && s.downloads.length > 0) {
        count.textContent = s.downloads.length;
        list.innerHTML = s.downloads.map(d =>
          '<div class="download-item">' +
            '<div class="download-name">' + escapeHtml(d.name) + '</div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:' + d.progress + '%"></div></div>' +
            '<div class="download-info"><span>' + d.progress + '%</span><span>' + formatSpeed(d.speed) + '</span></div>' +
          '</div>'
        ).join('');
      } else {
        count.textContent = '0';
        list.innerHTML = '<div class="empty-text">Khong co file nao dang tai</div>';
      }
    } catch(e) { /* ignore */ }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatSpeed(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB/s';
    if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
    return bytes + ' B/s';
  }

  // ===== Init =====
  loadConfig();
  pollStatus();
  setInterval(pollStatus, 2000);
</script>
</body>
</html>`;
}
