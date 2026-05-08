import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/Layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';
import TablePage from './pages/TablePage';
import TargetsPage from './pages/TargetsPage';
import IngestionPage from './pages/IngestionPage';
import TargetDetailPage from './components/Targets/TargetDetailPage';
import ReportPage from './pages/ReportPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="targets" element={<TargetsPage />} />
        <Route path="targets/:id" element={<TargetDetailPage />} />
        <Route path="ingestion" element={<IngestionPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
