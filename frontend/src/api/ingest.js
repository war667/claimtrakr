import client, { uploadClient } from './client';

export const fetchIngestionStatus = () =>
  client.get('/api/v1/ingest/status').then((r) => r.data);

export const fetchIngestionSources = () =>
  client.get('/api/v1/ingest/sources').then((r) => r.data);

export const fetchIngestionRuns = (params) =>
  client.get('/api/v1/ingest/runs', { params }).then((r) => r.data);

export const fetchIngestionRun = (runId) =>
  client.get(`/api/v1/ingest/runs/${runId}`).then((r) => r.data);

export const triggerIngestionAll = () =>
  client.post('/api/v1/ingest/trigger').then((r) => r.data);

export const triggerIngestionSource = (sourceKey) =>
  client.post(`/api/v1/ingest/trigger/${sourceKey}`).then((r) => r.data);

export const fetchIngestionRunById = (runId) =>
  client.get(`/api/v1/ingest/runs/${runId}`).then((r) => r.data);

export const uploadFile = (formData) =>
  uploadClient.post('/api/v1/ingest/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const cleanupRuns = () =>
  client.post('/api/v1/ingest/runs/cleanup').then((r) => r.data);
