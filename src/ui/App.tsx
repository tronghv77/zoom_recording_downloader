import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { RecordingsPage } from './pages/RecordingsPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { GuidePage } from './pages/GuidePage';
import { LoginPage } from './pages/LoginPage';
import { isWeb } from './api/client';
import { I18nProvider } from './i18n';

export function App() {
  const [authenticated, setAuthenticated] = useState(isWeb ? false : true);
  const [checking, setChecking] = useState(isWeb);
  const [updateBanner, setUpdateBanner] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    // Load theme
    async function loadTheme() {
      try {
        const settings = await (window as any).api?.settings?.getAll();
        const theme = settings?.theme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      } catch {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }

    // Check auth in web mode
    async function checkAuth() {
      if (!isWeb) return;
      try {
        const res = await fetch('/api/auth/status', { credentials: 'include' });
        const data = await res.json();
        setAuthenticated(data.data?.authenticated || false);
        if (data.data?.authenticated) loadTheme();
      } catch {
        setAuthenticated(false);
      } finally {
        setChecking(false);
      }
    }

    if (isWeb) {
      checkAuth();
    } else {
      loadTheme();
    }

    // Auto-check for updates (silent, non-blocking)
    fetch('https://api.github.com/repos/tronghv77/zoom_recording_downloader/releases/latest', {
      headers: { 'User-Agent': 'ZoomDL' },
    }).then(r => r.json()).then(data => {
      const latest = (data.tag_name || '').replace(/^v/, '');
      const current = '1.0.0';
      const [lM, lm = 0, lp = 0] = latest.split('.').map(Number);
      const [cM, cm = 0, cp = 0] = current.split('.').map(Number);
      if (lM > cM || (lM === cM && lm > cm) || (lM === cM && lm === cm && lp > cp)) {
        const exe = data.assets?.find((a: any) => a.name.includes('Setup'));
        setUpdateBanner({ version: latest, url: exe?.browser_download_url || data.html_url || '' });
      }
    }).catch(() => {});
  }, []);

  function handleLogin() {
    setAuthenticated(true);
    // Load theme after login
    (window as any).api?.settings?.getAll().then((s: any) => {
      document.documentElement.setAttribute('data-theme', s?.theme || 'dark');
    }).catch(() => {});
  }

  if (checking) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (isWeb && !authenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <I18nProvider>
      <HashRouter>
        <Layout>
          {updateBanner && (
            <div className="update-banner-top">
              <span>✨ Phiên bản mới <strong>v{updateBanner.version}</strong> đã sẵn sàng!</span>
              <a href={updateBanner.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Tải về</a>
              <button className="update-banner-close" onClick={() => setUpdateBanner(null)}>×</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/recordings" element={<RecordingsPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/guide" element={<GuidePage />} />
          </Routes>
        </Layout>
      </HashRouter>
    </I18nProvider>
  );
}
