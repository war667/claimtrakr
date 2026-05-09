import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem('ct_auth'));
  } catch {
    return null;
  }
}

function makeClient(extraConfig = {}) {
  const instance = axios.create({ baseURL: BASE_URL, ...extraConfig });

  instance.interceptors.request.use((config) => {
    const auth = getStoredAuth();
    if (auth) {
      config.auth = { username: auth.username, password: auth.password };
    }
    return config;
  });

  instance.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem('ct_auth');
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }
  );

  return instance;
}

const client = makeClient({ headers: { 'Content-Type': 'application/json' } });
export const uploadClient = makeClient();

export default client;
