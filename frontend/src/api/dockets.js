const BASE_URL = import.meta.env.VITE_API_URL ?? '';

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem('ct_auth'));
  } catch {
    return null;
  }
}

function authHeader() {
  const auth = getAuth();
  if (!auth) return {};
  const encoded = btoa(`${auth.username}:${auth.password}`);
  return { Authorization: `Basic ${encoded}` };
}

async function apiFetch(path, opts = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...opts.headers },
  });
  if (!resp.ok) {
    let detail = `Server error ${resp.status}`;
    try { const d = await resp.json(); if (d.detail) detail = d.detail; } catch {}
    throw new Error(detail);
  }
  return resp.json();
}

export function listDockets(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();
  return apiFetch(`/api/v1/dockets${qs ? `?${qs}` : ''}`);
}

export function getDocket(docketNr) {
  return apiFetch(`/api/v1/dockets/${encodeURIComponent(docketNr)}`);
}

export function fetchDocket(docketNr) {
  return apiFetch(`/api/v1/dockets/${encodeURIComponent(docketNr)}/fetch`, { method: 'POST' });
}

export async function streamAskDocket({ docketNr, question, history = [], onChunk, onDone, onError, signal }) {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/v1/dockets/${encodeURIComponent(docketNr)}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ question, history }),
      signal,
    });
  } catch (err) {
    onError(err.message || 'Network error');
    return;
  }

  if (!response.ok) {
    let detail = `Server error ${response.status}`;
    try { const d = await response.json(); if (d.detail) detail = d.detail; } catch {}
    onError(detail);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let done, value;
    try { ({ done, value } = await reader.read()); } catch { break; }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') { onDone(); return; }
      try {
        const obj = JSON.parse(payload);
        if (obj.error) { onError(obj.error); return; }
        if (obj.text) onChunk(obj.text);
      } catch {}
    }
  }
  onDone();
}
