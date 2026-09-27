// "People you know" — contacts met at a previous edition of the same event series.
// Purely informational: never touches score, tier, or the person-matching/nudge logic.
import { relationshipSignal } from './signals.js';

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
 * "Previous" = a different conference record, dated before this one starts.
 * Returns [{ person, signal }].
 */
export function peopleYouKnow(conf, store, today) {
  const metIds = new Map(); // personId -> last matching encounter date
  for (const e of store.encounters()) {
    if (e.conferenceId === conf.id) continue;
    if (e.date >= conf.startDate) continue;
    if (!sameSeries(e.event, conf.name)) continue;
    const prev = metIds.get(e.personId);
    if (!prev || e.date > prev) metIds.set(e.personId, e.date);
  }
  return [...metIds.entries()]
    .map(([personId, lastDate]) => {
      const person = store.person(personId);
      if (!person) return null;
      return { person, signal: relationshipSignal(store.encountersFor(personId), today), lastDate };
    })
    .filter(Boolean)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
