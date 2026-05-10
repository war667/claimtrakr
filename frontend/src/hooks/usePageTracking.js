import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordPageView } from '../api/analytics';

const PAGE_LABELS = {
  '/': 'Dashboard',
  '/map': 'Map',
  '/table': 'Claims Table',
  '/targets': 'Targets',
  '/leases': 'Leases',
  '/ingestion': 'Ingestion',
  '/report': 'Report',
  '/admin': 'Admin',
  '/analytics': 'Analytics',
};

function normalizePath(pathname) {
  if (/^\/targets\/\d+/.test(pathname)) return '/targets/:id';
  if (/^\/leases\/\d+/.test(pathname)) return '/leases/:id';
  return pathname;
}

export default function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const page = normalizePath(location.pathname);
    if (page === '/login') return;
    const label = PAGE_LABELS[page] || page;
    recordPageView(label);
  }, [location.pathname]);
}
