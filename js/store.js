// The ONLY file that touches localStorage.
// Seed data (data/*.json) is read fresh on every load; the team's changes live in an overlay.
// Rule: never rename an `id` in data/*.json — overlay entries point at ids.

export function emptyOverlay() {
  return {
    conferencePlans: {},   // { [conferenceId]: { status: 'going'|'considering'|'skip'|null, rep: string|null } }
    addedConferences: [],
    addedPeople: [],
    personPatches: {},     // { [personId]: { company?, title?, email?, linkedin? } } latest known
    addedEncounters: [],
    notSamePairs: [],      // [[idA, idB]] added to the seed pairs
    unresolvedMatches: {}, // { [newPersonId]: [candidateId, ...] }
    aiSummaries: {},       // { [personId]: summary } overrides seed aiSummaries
    hubspotPushed: {},     // { [personId]: 'YYYY-MM-DD' }
  };
}

const DEFAULT_SETTINGS = { me: '', team: [], geminiKey: '', hubspotToken: '' };

// localStorage can throw (private mode, full, blocked). Fall back to memory so the app still works.
export function safeStorage(storage) {
  const mem = new Map();
  const ok = (() => {
    try { storage.setItem('grain.__probe', '1'); storage.removeItem('grain.__probe'); return true; } catch { return false; }
  })();
  return {
    getItem: (k) => { try { return ok ? storage.getItem(k) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
    setItem: (k, v) => { try { if (ok) storage.setItem(k, v); else mem.set(k, v); } catch { mem.set(k, v); } },
    removeItem: (k) => { try { if (ok) storage.removeItem(k); } catch { /* ignore */ } mem.delete(k); },
  };
}

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function newId(prefix) {
  const rand = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null && obj[k] !== '').map((k) => [k, obj[k]]));

/**
 * seed: { conferences: <data/conferences.json>, contacts: <data/contacts.json> }
 * storage: localStorage-like object. prefix: key prefix ('grain.' in the app, 'grain.test.' in tests).
 */
export function createStore({ seed, storage, prefix = 'grain.' }) {
  const OVERLAY = `${prefix}overlay.v1`;
  const SETTINGS = `${prefix}settings.v1`;
  const DRAFT = `${prefix}captureDraft.v1`;

  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
    } catch {
      return fallback; // corrupted JSON: start clean rather than crash
    }
  };

  let overlay = read(OVERLAY, emptyOverlay());
  let settings = read(SETTINGS, { ...DEFAULT_SETTINGS });
  const listeners = new Set();
  const persist = () => {
    storage.setItem(OVERLAY, JSON.stringify(overlay));
    listeners.forEach((fn) => fn());
  };

  const seedConfs = seed.conferences.conferences || [];
  const seedPeople = seed.contacts.people || [];
  const seedEncounters = seed.contacts.encounters || [];

  const api = {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // ---- Conferences ----
    conferences() { return [...seedConfs, ...overlay.addedConferences]; },
    conference(id) { return api.conferences().find((c) => c.id === id) || null; },
    conferencePlan(id) { return { status: null, rep: null, ...(overlay.conferencePlans[id] || {}) }; },
    setConferencePlan(id, patch) {
      overlay.conferencePlans[id] = { ...api.conferencePlan(id), ...patch };
      persist();
    },
    addConference(conf) {
      const saved = { ...conf, id: conf.id || newId('conf') };
      overlay.addedConferences.push(saved);
      persist();
      return saved;
    },

    // ---- People and encounters ----
    people() {
      return [...seedPeople, ...overlay.addedPeople].map((p) => ({ ...p, ...(overlay.personPatches[p.id] || {}) }));
    },
    person(id) { return api.people().find((p) => p.id === id) || null; },
    encounters() { return [...seedEncounters, ...overlay.addedEncounters]; },
    encountersFor(personId) {
      return api.encounters().filter((e) => e.personId === personId).sort((a, b) => a.date.localeCompare(b.date));
    },
    notSamePairs() { return [...(seed.contacts.notSamePairs || []), ...overlay.notSamePairs]; },
    addNotSamePair(a, b) { overlay.notSamePairs.push([a, b]); persist(); },
    patchPerson(personId, fields) {
      overlay.personPatches[personId] = { ...(overlay.personPatches[personId] || {}), ...pick(fields, ['company', 'title', 'email', 'linkedin']) };
      persist();
    },

    /**
     * capture: { conferenceId|null, event, date, name, company, title, email, linkedin, temperature, note, rep }
     * link: { personId, via: 'email'|'linkedin'|'confirmed' } to add to a known person, or null for a new person.
     * rejectedIds: people the rep said "No" to. unresolvedIds: suggestions the rep ignored.
     * Returns { personId, encounter, isNew }.
     */
    saveCapture(capture, { link = null, rejectedIds = [], unresolvedIds = [] } = {}) {
      let personId = link && link.personId;
      const isNew = !personId;
      if (isNew) {
        personId = newId('p');
        overlay.addedPeople.push({ id: personId, name: capture.name.trim(), ...pick(capture, ['company', 'title', 'email', 'linkedin']) });
        for (const id of rejectedIds) overlay.notSamePairs.push([personId, id]);
        if (unresolvedIds.length) overlay.unresolvedMatches[personId] = [...unresolvedIds];
      } else {
        overlay.personPatches[personId] = { ...(overlay.personPatches[personId] || {}), ...pick(capture, ['company', 'title', 'email', 'linkedin']) };
      }
      const encounter = {
        id: newId('e'),
        personId,
        conferenceId: capture.conferenceId || null,
        event: capture.event,
        date: capture.date,
        nameAsEntered: capture.name.trim(),
        company: capture.company || '',
        title: capture.title || null,
        email: capture.email || null,
        linkedin: capture.linkedin || null,
        temperature: capture.temperature,
        note: capture.note || '',
        rep: capture.rep || '',
        capturedAt: new Date().toISOString(),
        linkedBy: isNew ? 'new' : (link.via || 'confirmed'),
      };
      overlay.addedEncounters.push(encounter);
      persist();
      return { personId, encounter, isNew };
    },

    // ---- Unresolved suggestions (rep saved without answering) ----
    unresolvedFor(personId) { return overlay.unresolvedMatches[personId] || []; },
    resolveDifferent(personId, candidateId) {
      overlay.notSamePairs.push([personId, candidateId]);
      const rest = api.unresolvedFor(personId).filter((id) => id !== candidateId);
      if (rest.length) overlay.unresolvedMatches[personId] = rest; else delete overlay.unresolvedMatches[personId];
      persist();
    },
    // Merge a person created in this browser into an existing person (rep said "Same person" later).
    mergeInto(fromId, toId) {
      const from = overlay.addedPeople.find((p) => p.id === fromId);
      if (!from) return false;
      for (const e of overlay.addedEncounters) if (e.personId === fromId) { e.personId = toId; e.linkedBy = 'confirmed'; }
      overlay.personPatches[toId] = { ...(overlay.personPatches[toId] || {}), ...pick(from, ['company', 'title', 'email', 'linkedin']) };
      overlay.addedPeople = overlay.addedPeople.filter((p) => p.id !== fromId);
      delete overlay.unresolvedMatches[fromId];
      delete overlay.aiSummaries[fromId];
      delete overlay.hubspotPushed[fromId];
      persist();
      return true;
    },

    // ---- AI summaries (overlay first, then the pre-generated ones in contacts.json) ----
    aiSummary(personId) { return overlay.aiSummaries[personId] || (seed.contacts.aiSummaries || {})[personId] || null; },
    setAiSummary(personId, summary) { overlay.aiSummaries[personId] = summary; persist(); },
    exportAiSummaries() { return { ...(seed.contacts.aiSummaries || {}), ...overlay.aiSummaries }; },

    // ---- HubSpot ----
    hubspotPushed(personId) { return overlay.hubspotPushed[personId] || null; },
    markPushed(personId, date) { overlay.hubspotPushed[personId] = date; persist(); },

    // ---- Settings (survive "Reset demo data") ----
    settings() { return { ...settings }; },
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      storage.setItem(SETTINGS, JSON.stringify(settings));
      listeners.forEach((fn) => fn());
    },
    team() { return settings.team && settings.team.length ? settings.team : (seed.contacts.team || []); },

    // ---- Capture draft (survives tab switches, reloads and a phone killing the tab) ----
    draft() { return read(DRAFT, {}); },
    setDraft(d) { storage.setItem(DRAFT, JSON.stringify(d || {})); },
    clearDraft() { storage.removeItem(DRAFT); },

    // ---- Reset ----
    resetOverlay() {
      overlay = emptyOverlay();
      storage.removeItem(OVERLAY);
      listeners.forEach((fn) => fn());
    },
  };
  return api;
}
