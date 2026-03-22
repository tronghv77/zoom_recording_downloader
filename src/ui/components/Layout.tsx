import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from '../i18n';
import type { TranslationKey } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems: { path: string; labelKey: TranslationKey }[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard' },
  { path: '/accounts', labelKey: 'nav.accounts' },
  { path: '/recordings', labelKey: 'nav.recordings' },
  { path: '/downloads', labelKey: 'nav.downloads' },
  { path: '/settings', labelKey: 'nav.settings' },
  { path: '/guide', labelKey: 'nav.guide' },
];

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>ZoomDL</h1>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item--active' : ''}`
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
