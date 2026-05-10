import client from './client';

export const recordPageView = (page) =>
  client.post('/api/v1/analytics/pageview', { page }).catch(() => {});

export const fetchAnalyticsSummary = () =>
  client.get('/api/v1/analytics/summary').then((r) => r.data);
