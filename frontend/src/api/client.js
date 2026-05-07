import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

const client = axios.create({
  baseURL: BASE_URL,
  auth: {
    username: import.meta.env.VITE_AUTH_USER || 'admin',
    password: import.meta.env.VITE_AUTH_PASS || 'changeme_strong_password',
  },
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadClient = axios.create({
  baseURL: BASE_URL,
  auth: {
    username: import.meta.env.VITE_AUTH_USER || 'admin',
    password: import.meta.env.VITE_AUTH_PASS || 'changeme_strong_password',
  },
});

export default client;
