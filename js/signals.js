// Pure relationship logic: rules label + reasons, timeline markers, HubSpot payload, CSV.
import { sameCompany, norm } from './matching.js';
import { dayNumber } from './scoring.js';

export const LABELS = [
  'New',
  'Cooling - lost for now',
  'Warming - new role, re-engage',
  'Warming - act now',
  'Stalled - possible tire-kicker',
  'Steady - nurture',
];
const TEMP = { cold: 1, warm: 2, hot: 3 };

// Concrete asks: matched at a word start, case-insensitive.
const ASKS = [
  ['volumes', /\bvolumes?\b/i],
  ['amount', /\b(eur|usd|gbp|ils|chf|pln)\s?\d[\d.,]*\s?(k|m|bn)?\b|[€$£]\s?\d[\d.,]*\s?(k|m|bn)?\b|\b\d[\d.,]*\s?(k|m|bn)\s?\/\s?(month|year|mo|yr)\b/i],
  ['pricing', /\bpric(e|es|ing)\b/i],
  ['demo', /\bdemos?\b/i],
  ['proposal', /\bproposals?\b/i],
  ['intro to finance', /\bintro(duction)? to (their |the )?(cfo|finance|treasury)\b/i],
  ['shortlist', /\bshortlist/i],
  ['references', /\breferences?\b/i],
  ['budget', /\bbudget/i],
  ['contract', /\bcontracts?\b/i],
  ['RFP', /\brfps?\b/i],
  ['questionnaire', /\bquestionnaires?\b/i],
  ['security review', /\bsecurity review/i],
  ['trial', /\btrials?\b/i],
  ['pilot', /\bpilots?\b/i],
];

export function findAsks(note) {
  return ASKS.filter(([, re]) => re.test(note || '')).map(([name]) => name);
}

export function seniority(title) {
  const t = norm(title);
  if (!t) return 1;
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return 4;
  if (/\b(chief|ceo|cfo|cto|coo|cro|cmo|founder|cofounder|owner|president)\b/.test(t)) return 5;
  if (/\b(head|director)\b/.test(t)) return 3;
  if (/\b(manager|lead)\b/.test(t)) return 2;
  return 1;
}

const byDate = (a, b) => a.date.localeCompare(b.date);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthsBetween = (a, b) => Math.round((dayNumber(b) - dayNumber(a)) / 30.44);

// Previous known company before index i (skips empty companies).
function prevCompany(encs, i) {
  for (let j = i - 1; j >= 0; j--) if (encs[j].company) return encs[j].company;
  return '';
}

// One marker list per encounter (same order as the sorted encounters).
export function timelineMarkers(encounters) {
  const encs = [...encounters].sort(byDate);
  return encs.map((e, i) => {
    const marks = [];
    if (i === 0) return { encounter: e, marks };
    const before = prevCompany(encs, i);
    const prevTitle = encs.slice(0, i).reverse().find((x) => x.title)?.title || '';
    const up = e.title && prevTitle ? Math.sign(seniority(e.title) - seniority(prevTitle)) : 0;
    if (e.company && before && sameCompany(e.company, before) === false) {
      marks.push({ type: 'job', text: `Job change: ${before} → ${e.company}${up > 0 ? ' ↑ more senior' : ''}` });
    } else if (up !== 0) {
      marks.push({ type: 'seniority', text: `${up > 0 ? 'Promoted' : 'New title'}: ${prevTitle} → ${e.title}` });
    }
    return { encounter: e, marks };
  });
}

/**
 * encounters: all encounters of one person (any order). today: 'YYYY-MM-DD'.
 * Returns { label, reasons: [string], meetings, asks: [string] }
 */
export function relationshipSignal(encounters, today) {
  const encs = [...encounters].sort(byDate);
  const n = encs.length;
  if (!n) return { label: 'New', reasons: [], meetings: 0, asks: [] };
  const latest = encs[n - 1];
  const prev = encs[n - 2];
  const temps = encs.map((e) => TEMP[e.temperature] || 0);
  const latestAsks = findAsks(latest.note);
  const allAsks = [...new Set(encs.flatMap((e) => findAsks(e.note)))];
  const spanDays = dayNumber(latest.date) - dayNumber(encs[0].date);
  const before = prevCompany(encs, n - 1);
  const companyChanged = !!(latest.company && before && sameCompany(latest.company, before) === false);

  const reasons = [plural(n, 'meeting')];
  if (n > 1) reasons.push(`over ${plural(Math.max(1, monthsBetween(encs[0].date, latest.date)), 'month')}`);
  if (today) {
    const ago = monthsBetween(latest.date, today);
    reasons.push(ago < 1 ? 'last met this month' : `last met ${plural(ago, 'month')} ago`);
  }
  if (n > 1) reasons.push(encs.map((e) => e.temperature).join(' → '));
  reasons.push(allAsks.length ? `asks: ${allAsks.join(', ')}` : 'no concrete asks');
  for (const m of timelineMarkers(encs)) for (const mark of m.marks) reasons.push(mark.text);

  let label;
  if (n === 1) label = 'New';
  else if (latest.temperature === 'cold' && temps.slice(0, -1).some((x) => x > TEMP.cold)) label = 'Cooling - lost for now';
  else if (companyChanged) label = 'Warming - new role, re-engage';
  else if (latest.temperature === 'hot' && ((TEMP[latest.temperature] > (TEMP[prev.temperature] || 0)) || latestAsks.length)) label = 'Warming - act now';
  else if (n >= 3 && spanDays >= 182 && !temps.includes(TEMP.hot) && !allAsks.length) label = 'Stalled - possible tire-kicker';
  else label = 'Steady - nurture';

  return { label, reasons, meetings: n, asks: allAsks };
}

export function cutNote(note, max = 80) {
  const s = String(note || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

// "Warming - act now · 3 meetings · last met at Money20/20 Europe 2026 · "Now VP Finance. …""
export function summaryLine(signal, encounters) {
  const encs = [...encounters].sort(byDate);
  const latest = encs[encs.length - 1];
  if (!latest) return signal.label;
  const parts = [signal.label, plural(encs.length, 'meeting'), `last met at ${latest.event}`];
  if (latest.note) parts.push(`"${cutNote(latest.note)}"`);
  return parts.join(' · ');
}

export function hubspotPayload(person, encounters, signal) {
  const encs = [...encounters].sort(byDate);
  const [firstname, ...rest] = String(person.name || '').trim().split(/\s+/);
  return {
    email: String(person.email || '').trim().toLowerCase(),
    firstname: firstname || '',
    lastname: rest.join(' '),
    company: person.company || '',
    jobtitle: person.title || '',
    grain_lead_source: encs[0] ? encs[0].event : '',
    grain_conference_summary: summaryLine(signal, encs),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// rows: [{ person, encounters, signal }] -> CSV text (the caller adds the BOM when downloading).
export function contactsCsv(rows) {
  const header = ['name', 'company', 'title', 'email', 'linkedin', 'first event', 'last event', 'meetings', 'signal', 'last note'];
  const lines = rows.map(({ person, encounters, signal }) => {
    const encs = [...encounters].sort(byDate);
    const first = encs[0];
    const last = encs[encs.length - 1];
    return [person.name, person.company, person.title, person.email, person.linkedin,
      first ? first.event : '', last ? last.event : '', encs.length, signal.label, last ? last.note : ''];
  });
  return [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
