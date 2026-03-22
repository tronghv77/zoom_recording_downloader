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
