import client from './client';

export const fetchStats = () =>
  client.get('/api/v1/ref/stats').then((r) => r.data);

export const fetchCounties = () =>
  client.get('/api/v1/ref/counties').then((r) => r.data);

export const fetchClaimTypes = () =>
  client.get('/api/v1/ref/claim-types').then((r) => r.data);

export const fetchDispositionCodes = () =>
  client.get('/api/v1/ref/disposition-codes').then((r) => r.data);

export const fetchWorkflowStatuses = () =>
  client.get('/api/v1/ref/workflow-statuses').then((r) => r.data);
