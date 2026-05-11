import client from './client';

export const importPaymentReport = (text) =>
  client.post('/api/v1/payments/import', { text }).then((r) => r.data);

export const fetchPayments = (params) =>
  client.get('/api/v1/payments', { params }).then((r) => r.data);

export const fetchPaymentsSummary = () =>
  client.get('/api/v1/payments/summary').then((r) => r.data);

export const fetchTownshipRanges = () =>
  client.get('/api/v1/payments/township-ranges').then((r) => r.data);

export const updatePaidStatus = (id, body) =>
  client.put(`/api/v1/payments/${id}/paid`, body).then((r) => r.data);

export const deletePaymentEntry = (id) =>
  client.delete(`/api/v1/payments/${id}`);
