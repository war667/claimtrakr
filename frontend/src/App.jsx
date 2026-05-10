import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppShell from './components/Layout/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';
import TablePage from './pages/TablePage';
import TargetsPage from './pages/TargetsPage';
import IngestionPage from './pages/IngestionPage';
import TargetDetailPage from './components/Targets/TargetDetailPage';
import ReportPage from './pages/ReportPage';
import AdminPage from './pages/AdminPage';
import LeasesPage from './pages/LeasesPage';
import LeaseDetailPage from './pages/LeaseDetailPage';

function RequireAuth({ children }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="table" element={<TablePage />} />
          <Route path="targets" element={<TargetsPage />} />
          <Route path="targets/:id" element={<TargetDetailPage />} />
          <Route path="ingestion" element={<IngestionPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="leases" element={<LeasesPage />} />
          <Route path="leases/:id" element={<LeaseDetailPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
