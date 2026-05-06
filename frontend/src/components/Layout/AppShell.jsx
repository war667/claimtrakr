import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import DisclaimerBanner from '../shared/DisclaimerBanner';

export default function AppShell() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <Sidebar />
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <TopBar />
        <DisclaimerBanner />
        <main style={{
          flex: 1,
          overflow: 'auto',
          background: '#f9fafb',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
