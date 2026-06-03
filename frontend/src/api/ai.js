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

/**
 * Stream a chat response from the AI endpoint.
 * Calls onChunk(text) for each streamed token, onDone() when finished,
 * onError(msg) on failure.
 */
export async function streamChat({ messages, onChunk, onDone, onError, signal }) {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (err) {
    onError(err.message || 'Network error');
    return;
  }

  if (!response.ok) {
    let detail = `Server error ${response.status}`;
    try {
      const data = await response.json();
      if (data.detail) detail = data.detail;
    } catch {}
    onError(detail);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let done, value;
    try {
      ({ done, value } = await reader.read());
    } catch {
      break;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') {
        onDone();
        return;
      }
      try {
        const obj = JSON.parse(payload);
        if (obj.error) { onError(obj.error); return; }
        if (obj.text) onChunk(obj.text);
      } catch {}
    }
  }

  onDone();
}
