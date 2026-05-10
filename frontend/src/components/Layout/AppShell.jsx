import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import DisclaimerBanner from '../shared/DisclaimerBanner';
import useIsMobile from '../../hooks/useIsMobile';
import usePageTracking from '../../hooks/usePageTracking';

export default function AppShell() {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  usePageTracking();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop sidebar — always visible */}
      {!isMobile && <Sidebar />}

      {/* Mobile sidebar drawer */}
      {isMobile && drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 2000,
            }}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 0, left: 0, height: '100vh',
            zIndex: 2001,
          }}>
            <Sidebar onNavClick={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <TopBar onMenuClick={isMobile ? () => setDrawerOpen((v) => !v) : null} />
        <DisclaimerBanner />
        <main style={{ flex: 1, overflow: 'auto', background: '#0a1628' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
