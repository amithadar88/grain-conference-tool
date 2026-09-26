// Calls to the two Netlify functions. Always resolves to { ok: true, ... } or
// { ok: false, error, message } with a plain-language message. Never throws.

export const MESSAGES = {
  offline: 'Needs connection',
  no_key: 'AI needs a key: add one in Settings',
  bad_key: 'The Gemini key was rejected: check it in Settings',
  busy: 'AI is busy, try again in a minute',
  timeout: 'Took too long, try again or fill in manually',
  fetch_failed: "Couldn't read that page: paste a description or fill in manually",
  bad_url: 'That link doesn\'t look like a public web page',
  bad_output: "The AI's answer didn't make sense: try again or fill in manually",
  no_function: 'AI and HubSpot only work on the live site (not in local preview)',
  no_token: 'Add a HubSpot token in Settings',
  hubspot_auth: 'HubSpot token invalid or missing permissions',
  unavailable: 'AI unavailable right now',
};

async function post(fn, body, timeoutMs) {
  if (!navigator.onLine) return { ok: false, error: 'offline', message: MESSAGES.offline };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      const error = [404, 405, 501].includes(res.status) ? 'no_function' : 'unavailable';
      return { ok: false, error, message: MESSAGES[error] };
    }
    if (!data.ok) return { ...data, message: MESSAGES[data.error] || data.message || MESSAGES.unavailable };
    return data;
  } catch (e) {
    const error = e && e.name === 'AbortError' ? 'timeout' : 'unavailable';
    return { ok: false, error, message: MESSAGES[error] };
  } finally {
    clearTimeout(timer);
  }
}

export const aiStatus = (key) => post('ai', { task: 'status', key }, 8000);
export const aiArc = (key, payload) => post('ai', { task: 'arc', key, ...payload }, 15000);
export const aiIntake = (key, payload) => post('ai', { task: 'intake', key, ...payload }, 15000);
export const hubspotPush = (token, contacts) => post('hubspot', { token, contacts }, 15000);
