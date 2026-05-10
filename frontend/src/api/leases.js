import client from './client';

export const fetchLeases = (params) =>
  client.get('/api/v1/leases', { params }).then((r) => r.data);

export const fetchExpiringLeases = (days = 90) =>
  client.get('/api/v1/leases/expiring', { params: { days } }).then((r) => r.data);

export const fetchLease = (id) =>
  client.get(`/api/v1/leases/${id}`).then((r) => r.data);

export const createLease = (body) =>
  client.post('/api/v1/leases', body).then((r) => r.data);

export const updateLease = (id, body) =>
  client.put(`/api/v1/leases/${id}`, body).then((r) => r.data);

export const deleteLease = (id) =>
  client.delete(`/api/v1/leases/${id}`);
