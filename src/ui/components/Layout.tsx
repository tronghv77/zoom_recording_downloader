import React from 'react';
import { NavLink } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '/' },
  { path: '/accounts', label: 'Accounts', icon: '/' },
  { path: '/recordings', label: 'Recordings', icon: '/' },
  { path: '/downloads', label: 'Downloads', icon: '/' },
  { path: '/settings', label: 'Settings', icon: '/' },
];

export function Layout({ children }: LayoutProps) {
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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
