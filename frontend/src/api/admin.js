import client from './client';

export const fetchMe = () =>
  client.get('/api/v1/admin/me').then((r) => r.data);

export const fetchUsers = () =>
  client.get('/api/v1/admin/users').then((r) => r.data);

export const createUser = (body) =>
  client.post('/api/v1/admin/users', body).then((r) => r.data);

export const updateUser = (id, body) =>
  client.put(`/api/v1/admin/users/${id}`, body).then((r) => r.data);

export const fetchLoginEvents = () =>
  client.get('/api/v1/admin/login-events').then((r) => r.data);
