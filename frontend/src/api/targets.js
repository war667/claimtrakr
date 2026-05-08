import client, { uploadClient } from './client';

export const fetchTargets = (params) =>
  client.get('/api/v1/targets', { params }).then((r) => r.data);

export const fetchTargetsReport = () =>
  client.get('/api/v1/targets/report').then((r) => r.data);

export const createTarget = (body) =>
  client.post('/api/v1/targets', body).then((r) => r.data);

export const fetchTarget = (id) =>
  client.get(`/api/v1/targets/${id}`).then((r) => r.data);

export const updateTarget = (id, body) =>
  client.put(`/api/v1/targets/${id}`, body).then((r) => r.data);

export const deleteTarget = (id) =>
  client.delete(`/api/v1/targets/${id}`);

export const fetchTargetHistory = (id) =>
  client.get(`/api/v1/targets/${id}/history`).then((r) => r.data);

export const fetchChecklist = (id) =>
  client.get(`/api/v1/targets/${id}/checklist`).then((r) => r.data);

export const updateChecklistItem = (targetId, itemId, body) =>
  client.put(`/api/v1/targets/${targetId}/checklist/${itemId}`, body).then((r) => r.data);

export const fetchTargetFiles = (id) =>
  client.get(`/api/v1/targets/${id}/files`).then((r) => r.data);

export const uploadTargetFile = (id, formData) =>
  uploadClient.post(`/api/v1/targets/${id}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const deleteTargetFile = (targetId, fileId) =>
  client.delete(`/api/v1/targets/${targetId}/files/${fileId}`);
