import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8084',
  auth: {
    username: import.meta.env.VITE_AUTH_USER || 'admin',
    password: import.meta.env.VITE_AUTH_PASS || 'changeme',
  },
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8084',
  auth: {
    username: import.meta.env.VITE_AUTH_USER || 'admin',
    password: import.meta.env.VITE_AUTH_PASS || 'changeme',
  },
});

export default client;
