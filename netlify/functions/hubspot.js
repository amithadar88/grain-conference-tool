// Netlify Function: HubSpot proxy (HubSpot blocks direct browser calls).
// The private-app token comes with each request from Settings and is never stored or logged here.
// Per contact: search by email -> update (stage untouched) or create (stage = lead). No duplicates.

const API = 'https://api.hubapi.com';
const PROPS = [
  { name: 'grain_lead_source', label: 'Grain lead source', type: 'string', fieldType: 'text', groupName: 'contactinformation',
    description: 'Conference where Grain first met this contact' },
  { name: 'grain_conference_summary', label: 'Grain conference summary', type: 'string', fieldType: 'textarea', groupName: 'contactinformation',
    description: 'Relationship signal across conferences, from the Grain conference tool' },
];
const FIELDS = ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'grain_lead_source', 'grain_conference_summary'];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

function client(token) {
  return async (path, opts = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(API + path, {
        ...opts,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) throw fail('hubspot_auth');
      if (res.status === 429) throw fail('busy');
      return res;
    } catch (e) {
      if (e.code) throw e;
      throw fail(e && e.name === 'AbortError' ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(t);
    }
  };
}

async function ensureProperties(hs) {
  for (const p of PROPS) {
    const r = await hs(`/crm/v3/properties/contacts/${p.name}`);
    if (r.ok) continue;
    if (r.status !== 404) throw fail('unavailable');
    const c = await hs('/crm/v3/properties/contacts', { method: 'POST', body: JSON.stringify(p) });
    if (!c.ok && c.status !== 409) throw fail('unavailable');
  }
}

async function errorText(res) {
  const body = await res.json().catch(() => ({}));
  return body.message || `HubSpot error ${res.status}`;
}

async function upsert(hs, contact) {
  const email = String(contact.email || '').trim().toLowerCase();
  if (!email) return { email: '', action: 'error', message: 'No email' };
  const properties = Object.fromEntries(FIELDS.filter((k) => contact[k] != null).map((k) => [k, String(contact[k])]));
  properties.email = email;
  try {
    const s = await hs('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], properties: ['email'], limit: 1 }),
    });
    if (!s.ok) return { email, action: 'error', message: await errorText(s) };
    let id = (((await s.json()).results || [])[0] || {}).id;
    if (!id) {
      const c = await hs('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties: { ...properties, lifecyclestage: 'lead' } }) });
      if (c.ok) return { email, action: 'created', id: (await c.json()).id };
      if (c.status !== 409) return { email, action: 'error', message: await errorText(c) };
      // Created moments ago and not in search yet: HubSpot tells us the existing id.
      id = ((await errorText(c)).match(/Existing ID:\s*(\d+)/) || [])[1];
      if (!id) return { email, action: 'error', message: 'Contact already exists' };
    }
    const u = await hs(`/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    if (!u.ok) return { email, action: 'error', message: await errorText(u) };
    return { email, action: 'updated', id };
  } catch (e) {
    return { email, action: 'error', message: e.code === 'hubspot_auth' ? 'HubSpot token invalid or missing permissions' : 'HubSpot unavailable' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'bad_request' }); }
  const token = String(body.token || '').trim();
  if (!token) return json(200, { ok: false, error: 'no_token' });
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  if (!contacts.length || contacts.length > 10) return json(400, { ok: false, error: 'bad_request' });

  const hs = client(token);
  try {
    await ensureProperties(hs);
  } catch (e) {
    return json(200, { ok: false, error: e.code === 'hubspot_auth' ? 'hubspot_auth' : e.code === 'busy' ? 'busy' : 'unavailable' });
  }
  const results = await Promise.all(contacts.map((c) => upsert(hs, c)));
  return json(200, { ok: true, results });
};
