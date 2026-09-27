// "People you know" — contacts met at a previous edition of the same event series.
// Purely informational: never touches score, tier, or the person-matching/nudge logic.
import { relationshipSignal } from './signals.js';
import { normCompany } from './matching.js';

const YEAR = /\b(19|20)\d{2}\b/g;

function normalizeSeriesName(name) {
  return String(name || '')
    .replace(YEAR, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

// Names a conference is known by, for series matching: its own name (parentheticals
// stripped, e.g. "MPE 2027 (Merchant Payments Ecosystem)" -> "mpe") plus a "(formerly X)"
// alias when present (e.g. "CrossTech World 2026 (formerly IMTC World)" -> also "imtc world").
export function seriesNames(name) {
  const raw = String(name || '');
  const formerly = raw.match(/\(\s*formerly\s+([^)]+)\)/i);
  const base = normalizeSeriesName(raw.replace(/\([^)]*\)/g, ' '));
  const names = base ? [base] : [];
  if (formerly) {
    const alias = normalizeSeriesName(formerly[1]);
    if (alias) names.push(alias);
  }
  return names;
}

// True if the shorter normalized name is a whole-word prefix of (or equal to) the longer
// one — so "eurofinance" matches "eurofinance international treasury management", but
// "money20 20 europe" does not match "money20 20 usa" (different series, shared brand).
function samePrefix(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return !!short && long.startsWith(`${short} `);
}

export function sameSeries(nameA, nameB) {
  const namesA = seriesNames(nameA);
  const namesB = seriesNames(nameB);
  return namesA.some((a) => namesB.some((b) => samePrefix(a, b)));
}

/**
 * People met at a previous edition of the same series as `conf`, most recently met first.
 * "Previous" = a different conference record, dated before this one starts. `company` is
 * the company recorded on that specific matching encounter — not the person's current
 * one — so a later job change doesn't rewrite who they were when they met at this event.
 * Returns [{ person, signal, lastDate, company }].
 */
export function peopleYouKnow(conf, store, today) {
  const met = new Map(); // personId -> { lastDate, company } of their latest matching encounter
  for (const e of store.encounters()) {
    if (e.conferenceId === conf.id) continue;
    if (e.date >= conf.startDate) continue;
    if (!sameSeries(e.event, conf.name)) continue;
    const prev = met.get(e.personId);
    if (!prev || e.date > prev.lastDate) met.set(e.personId, { lastDate: e.date, company: e.company });
  }
  return [...met.entries()]
    .map(([personId, { lastDate, company }]) => {
      const person = store.person(personId);
      if (!person) return null;
      return { person, signal: relationshipSignal(store.encountersFor(personId), today), lastDate, company };
    })
    .filter(Boolean)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/**
 * Groups a peopleYouKnow() list by company, using the same normalisation as person
 * matching (matching.js's normCompany) so suffix variants ("Acme Corp" / "Acme Corp
 * Ltd") land in one group instead of two. Rows with no company on file get their own
 * group at the end rather than being dropped from the list. Sorted by each group's most
 * recently met contact, since the input is already most-recent-first.
 */
export function companyGroups(rows) {
  const groups = new Map(); // normCompany key ('' = unknown) -> { company: display name, rows: [] }
  for (const r of rows) {
    const key = normCompany(r.company);
    if (!groups.has(key)) groups.set(key, { company: r.company || '', rows: [] });
    groups.get(key).rows.push(r);
  }
  const known = [...groups.entries()].filter(([key]) => key).map(([, g]) => g)
    .sort((a, b) => b.rows[0].lastDate.localeCompare(a.rows[0].lastDate));
  const unknown = groups.get('');
  return unknown ? [...known, unknown] : known;
}

// Distinct companies represented in a peopleYouKnow() list — for the "🏢 N companies" chip.
export function companyCount(rows) {
  return companyGroups(rows).filter((g) => g.company).length;
}

// "👥 3 contacts · 🏢 2 companies from a previous edition" — only the non-zero parts,
// '' when there's nothing to show. Shared by the event card chip and Today's trip rows.
export function peopleYouKnowLabel(rows) {
  if (!rows.length) return '';
  const companies = companyCount(rows);
  const parts = [`👥 ${rows.length} contact${rows.length === 1 ? '' : 's'}`];
  if (companies) parts.push(`🏢 ${companies} compan${companies === 1 ? 'y' : 'ies'}`);
  return `${parts.join(' · ')} from a previous edition`;
}
