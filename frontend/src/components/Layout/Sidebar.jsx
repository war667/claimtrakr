import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/',          icon: '🏠', label: 'Dashboard' },
  { to: '/map',       icon: '🗺',  label: 'Map' },
  { to: '/table',     icon: '📋', label: 'Claims Table' },
  { to: '/targets',   icon: '🎯', label: 'Targets' },
  { to: '/ingestion', icon: '⬇️', label: 'Ingestion' },
];

export default function Sidebar({ onNavClick }) {
  return (
    <aside style={{
      width: '200px',
      background: '#0a1628',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      color: '#f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100%',
    }}>
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
          ⛏ ClaimTrakr
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          UT / NV Mining Claims
        </div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavClick}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              textDecoration: 'none',
              color: isActive ? '#ffffff' : '#94a3b8',
              background: isActive ? '#0f2039' : 'transparent',
              borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
            })}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: '11px',
        color: '#334155',
      }}>
        Internal Use Only
      </div>
    </aside>
  );
}
