import client from './client';

export const fetchClaims = (params) =>
  client.get('/api/v1/claims', { params }).then((r) => r.data);

export const fetchClaimsGeoJSON = (params) =>
  client.get('/api/v1/claims/geojson', { params }).then((r) => r.data);

export const fetchClaim = (serialNr) =>
  client.get(`/api/v1/claims/${serialNr}`).then((r) => r.data);

export const fetchClaimEvents = (serialNr) =>
  client.get(`/api/v1/claims/${serialNr}/events`).then((r) => r.data);

export const fetchClaimRaw = (serialNr) =>
  client.get(`/api/v1/claims/${serialNr}/raw`).then((r) => r.data);
