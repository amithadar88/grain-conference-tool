// Pure matching logic: is this the same person / the same conference?
// Fuzzy matches are only ever suggestions; the rep decides.

const NICKNAMES = {
  jon: 'jonathan', jonny: 'jonathan', mike: 'michael', tom: 'thomas', tommy: 'thomas',
  kasia: 'katarzyna', sara: 'sarah', dave: 'david', dan: 'daniel', danny: 'daniel',
  bob: 'robert', rob: 'robert', bill: 'william', will: 'william', liz: 'elizabeth',
  beth: 'elizabeth', kate: 'katherine', katie: 'katherine', alex: 'alexander',
  chris: 'christopher', nick: 'nicholas', matt: 'matthew', jim: 'james', jimmy: 'james',
  joe: 'joseph', ben: 'benjamin', sam: 'samuel', pepe: 'jose',
};
const COMPANY_SUFFIXES = new Set(['ltd', 'limited', 'inc', 'llc', 'gmbh', 'sl', 'bv', 'sa', 'ag', 'plc', 'co', 'corp', 'srl', 'sas']);

// Lowercase, strip accents and punctuation, collapse spaces. "José García" -> "jose garcia".
export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Vantelo Pay B.V." -> "vantelo pay"; "Iberitrips S.L." -> "iberitrips".
export function normCompany(s) {
  const tokens = norm(s).replace(/\b([a-z]) ([a-z])\b/g, '$1$2').split(' ').filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

// true = same, false = different, null = unknown (one side empty).
export function sameCompany(a, b) {
  const x = normCompany(a);
  const y = normCompany(b);
  if (!x || !y) return null;
  return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ');
}

export function normEmail(s) {
  return String(s || '').trim().toLowerCase();
}

export function normLinkedin(s) {
  const v = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const m = v.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? `linkedin.com/in/${m[1]}` : v;
}

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const canon = (first) => NICKNAMES[first] || first;

function nameParts(name) {
  const tokens = norm(name).split(' ').filter(Boolean);
  if (!tokens.length) return null;
  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

export function namesSimilar(a, b) {
  const A = nameParts(a);
  const B = nameParts(b);
  if (!A || !B) return false;
  const lastOk = A.last === B.last || (A.last.length >= 4 && B.last.length >= 4 && levenshtein(A.last, B.last) <= 1);
  if (!lastOk) return false;
  if (A.first.length === 1 || B.first.length === 1) return A.first[0] === B.first[0];
  return canon(A.first) === canon(B.first) || levenshtein(A.first, B.first) <= 1 || levenshtein(canon(A.first), canon(B.first)) <= 1;
}

function groupByPerson(encounters) {
  const map = new Map();
  for (const e of [...encounters].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map.has(e.personId)) map.set(e.personId, []);
    map.get(e.personId).push(e);
  }
  return map;
}

function isBlocked(notSamePairs, a, b) {
  return notSamePairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * capture: { name, company, email, linkedin }
 * selfId: the id of the record being matched, if it already exists (its notSamePairs apply).
 * Returns { auto: { person, via: 'email'|'linkedin' } | null,
 *           candidates: [{ person, level: 'high'|'low', meetings, last }] }
 */
export function findMatches(capture, people, encounters, notSamePairs = [], selfId = null) {
  const byPerson = groupByPerson(encounters);
  const pool = people.filter((p) => p.id !== selfId && !(selfId && isBlocked(notSamePairs, selfId, p.id)));
  const email = normEmail(capture.email);
  const li = normLinkedin(capture.linkedin);

  for (const p of pool) {
    const encs = byPerson.get(p.id) || [];
    if (email && [p.email, ...encs.map((e) => e.email)].map(normEmail).includes(email)) return { auto: { person: p, via: 'email' }, candidates: [] };
    if (li && [p.linkedin, ...encs.map((e) => e.linkedin)].filter(Boolean).map(normLinkedin).includes(li)) return { auto: { person: p, via: 'linkedin' }, candidates: [] };
  }

  if (norm(capture.name).length < 3) return { auto: null, candidates: [] };
  const candidates = [];
  for (const p of pool) {
    const encs = byPerson.get(p.id) || [];
    const names = [p.name, ...encs.map((e) => e.nameAsEntered)];
    if (!names.some((n) => namesSimilar(capture.name, n))) continue;
    const level = sameCompany(capture.company, p.company) === true ? 'high' : 'low';
    candidates.push({ person: p, level, meetings: encs.length, last: encs[encs.length - 1] || null });
  }
  candidates.sort((a, b) => (a.level === b.level ? b.meetings - a.meetings : a.level === 'high' ? -1 : 1));
  return { auto: null, candidates };
}

// ---- Conference duplicates (Add conference): a warning, never a block ----

export function normEventName(s) {
  return norm(s).replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
}

// Full hostname (minus www.) + path (minus trailing slash, query, hash).
export function normUrl(u) {
  const raw = String(u || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function jaccard(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Returns [{ conf, reason: 'name'|'link' }]
export function findConferenceDuplicates({ name, website }, conferences) {
  const n = normEventName(name);
  const u = normUrl(website);
  const out = [];
  for (const c of conferences) {
    if (u && normUrl(c.website) === u) out.push({ conf: c, reason: 'link' });
    else if (n && (normEventName(c.name) === n || jaccard(normEventName(c.name), n) >= 0.8)) out.push({ conf: c, reason: 'name' });
  }
  return out;
}
